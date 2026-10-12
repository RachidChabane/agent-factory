import { assessPreflight, blocksAgentSpend, type PreflightVerdict } from '@agent-factory/domain';
import type { BaseCheckout, BaseCheckouts } from '../ports.ts';
import type { NamedCommand } from '../pipeline/pipeline-settings.ts';
import { accessOf, type ShellCommands, type ShellRun } from '../pipeline/shell-commands.ts';
import { dryFormOf } from './dry-forms.ts';

export const PREFLIGHT_PHASES = ['setup', 'before-acceptance', 'after-acceptance'] as const;
export type PreflightPhase = (typeof PREFLIGHT_PHASES)[number];
export const PREFLIGHT_WORKSPACE_NAME = 'gate-preflight';
export const DEFAULT_PREFLIGHT_STEP_TIMEOUT_MS = 120_000;
export const DEFAULT_PREFLIGHT_DRY_TIMEOUT_MS = 30_000;
export const DEFAULT_PREFLIGHT_SETUP_TIMEOUT_MS = 600_000;
const MILLISECONDS_PER_SECOND = 1_000;
const NEWLINE = '\n';

export interface PreflightStepReport {
  readonly phase: PreflightPhase;
  readonly name: string;
  readonly command: string;
  readonly verdict: PreflightVerdict;
  readonly blocking: boolean;
  readonly detail: string;
}

export interface GatePreflightSettings {
  readonly setupCommands: readonly NamedCommand[];
  readonly commandsBeforeAcceptance: readonly NamedCommand[];
  readonly commandsAfterAcceptance: readonly NamedCommand[];
  readonly stepTimeoutMs: number;
  readonly dryTimeoutMs: number;
  readonly setupTimeoutMs: number;
}

export interface GatePreflightDependencies {
  readonly workspaces: BaseCheckouts;
  readonly shell: ShellCommands;
}

interface PlannedStep {
  readonly phase: PreflightPhase;
  readonly command: NamedCommand;
}

function seconds(milliseconds: number): number {
  return Math.round(milliseconds / MILLISECONDS_PER_SECOND);
}

function lastLine(output: string): string {
  return output.trimEnd().split(NEWLINE).at(-1)?.trim() ?? '';
}

function report(step: PlannedStep, verdict: PreflightVerdict, detail: string): PreflightStepReport {
  return { phase: step.phase, name: step.command.name, command: step.command.run, verdict, blocking: blocksAgentSpend(verdict), detail };
}

function describe(step: PlannedStep, run: ShellRun, verdict: PreflightVerdict, evidence: string | null): string {
  if (!run.started) return run.reason;
  switch (verdict) {
    case 'passed':
      return `passed on the clean base in ${seconds(run.durationMs)} s`;
    case 'unfinished':
      return `no sandbox refusal within ${seconds(run.timeoutMs)} s; the preflight stopped it before it finished`;
    case 'network-undeclared':
      return `needs the network but declares none (${evidence ?? 'connection refused'}); add "network: <reason>" to ${step.command.name}`;
    case 'sandbox-refused':
      return `the sandbox refused it: ${evidence ?? 'operation not permitted'}`;
    case 'failed':
      return `fails on the clean base (exit code ${run.exitCode}): ${lastLine(run.output)}`;
    case 'not-runnable':
    case 'skipped':
      return run.output === '' ? 'could not run' : lastLine(run.output);
  }
}

function assess(step: PlannedStep, run: ShellRun): PreflightStepReport {
  if (!run.started) return report(step, 'not-runnable', run.reason);
  const assessment = assessPreflight({
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    output: run.output,
    networkDeclared: step.command.network !== undefined,
  });
  return report(step, assessment.verdict, describe(step, run, assessment.verdict, assessment.evidence));
}

export class GatePreflight {
  private readonly dependencies: GatePreflightDependencies;
  private readonly settings: GatePreflightSettings;

  constructor(dependencies: GatePreflightDependencies, settings: GatePreflightSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  async run(): Promise<readonly PreflightStepReport[]> {
    const steps = this.plannedSteps();
    if (steps.length === 0) return [];
    let workspace: BaseCheckout;
    try {
      workspace = await this.dependencies.workspaces.checkout(PREFLIGHT_WORKSPACE_NAME);
    } catch (error) {
      const reason = `the clean base workspace could not be prepared: ${error instanceof Error ? error.message : String(error)}`;
      return steps.map((step) => report(step, 'not-runnable', reason));
    }
    try {
      return await this.runSteps(steps, workspace.path);
    } finally {
      await this.dependencies.workspaces.remove(workspace);
    }
  }

  private plannedSteps(): readonly PlannedStep[] {
    const { setupCommands, commandsBeforeAcceptance, commandsAfterAcceptance } = this.settings;
    return [
      ...setupCommands.map((command): PlannedStep => ({ phase: 'setup', command })),
      ...commandsBeforeAcceptance.map((command): PlannedStep => ({ phase: 'before-acceptance', command })),
      ...commandsAfterAcceptance.map((command): PlannedStep => ({ phase: 'after-acceptance', command })),
    ];
  }

  private async runSteps(steps: readonly PlannedStep[], workspace: string): Promise<readonly PreflightStepReport[]> {
    const reports: PreflightStepReport[] = [];
    let failedSetup: string | null = null;
    for (const step of steps) {
      if (failedSetup !== null) {
        reports.push(report(step, 'skipped', `skipped: the setup step ${failedSetup} did not pass`));
        continue;
      }
      const outcome = step.phase === 'setup' ? await this.setup(step, workspace) : await this.gateStep(step, workspace);
      reports.push(outcome);
      if (step.phase === 'setup' && outcome.verdict !== 'passed') failedSetup = step.command.name;
    }
    return reports;
  }

  private async setup(step: PlannedStep, workspace: string): Promise<PreflightStepReport> {
    return assess(step, await this.dependencies.shell.run(step.command.run, workspace, accessOf(step.command), this.settings.setupTimeoutMs));
  }

  private async gateStep(step: PlannedStep, workspace: string): Promise<PreflightStepReport> {
    const { shell } = this.dependencies;
    const dry = dryFormOf(step.command.run);
    if (dry !== null) {
      const dryOutcome = assess(step, await shell.run(dry.command, workspace, accessOf(step.command), this.settings.dryTimeoutMs));
      if (dryOutcome.blocking) return { ...dryOutcome, detail: `${dry.command} (${dry.purpose}): ${dryOutcome.detail}` };
    }
    return assess(step, await shell.run(step.command.run, workspace, accessOf(step.command), this.settings.stepTimeoutMs));
  }
}
