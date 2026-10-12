import { evaluateBranchRun, evaluateSkillEval, isStructuredRunner } from '@agent-factory/domain';
import type { AcceptanceTestOnBase, AcceptanceTestOnBranch, FrozenCheck, GateResult, GateStepResult, IssueTypeDefinition, StructuredTestRunner } from '@agent-factory/domain';
import { acceptanceCommand, scoreOutputPath, type AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import { shellCommandLine, shellQuote } from '../acceptance/shell-quote.ts';
import { readScoreReport, skillEvalCases, type ScoreReport } from '../acceptance/score-report.ts';
import type { CommandSandbox, SourceControl, WorkspaceFiles, Worktree } from '../ports.ts';
import { StackStartError, type StackScope } from './issue-stack.ts';
import type { FrozenCheckViolation } from './journal-events.ts';
import type { GateSettings, NamedCommand } from './pipeline-settings.ts';
import { accessOf, describeOutcome, EXIT_CODE_SUCCESS, shellInvocation, tailLines, type ShellCommands } from './shell-commands.ts';
import { StructuredAcceptance } from './structured-acceptance.ts';

export const GATE_STEP_NAMES = {
  frozenChecks: 'frozen-checks',
  stack: 'stack',
  acceptance: 'acceptance',
  skillEval: 'skill-eval',
} as const;

/** Runs work inside the issue's stack, or as is when its checks need none. */
export type StackAround = <T>(work: (scope: StackScope | null) => Promise<T>) => Promise<T>;

export const NO_STACK: StackAround = (work) => work(null);

const STEP_PASSED = 'passed';
const SKIPPED_AFTER_FAILURE = 'skipped because an earlier step failed';
const LOG_SEPARATOR = '\n\n';
const COMMAND_JOINER = ' && ';
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EXPORT_KEYWORD = 'export';
const STATEMENT_SEPARATOR = '; ';
const ASSIGNMENT_SEPARATOR = ' ';
const NEWLINE = '\n';

export class InvalidVariableNameError extends Error {
  constructor(name: string) {
    super(`${JSON.stringify(name)} is not a shell variable name`);
    this.name = 'InvalidVariableNameError';
  }
}

export function exportStatement(environment: Readonly<Record<string, string>>): string | null {
  const assignments = Object.entries(environment).map(([name, value]) => {
    if (!VARIABLE_NAME.test(name)) throw new InvalidVariableNameError(name);
    return `${name}=${shellQuote(value)}`;
  });
  return assignments.length === 0 ? null : `${EXPORT_KEYWORD} ${assignments.join(ASSIGNMENT_SEPARATOR)}`;
}

export interface GateRun {
  readonly result: GateResult;
  readonly violations: readonly FrozenCheckViolation[];
  readonly log: string;
  readonly scoreReport: ScoreReport | null;
  readonly tests: readonly AcceptanceTestOnBranch[];
}

export interface BaseResults {
  readonly scoreReport: ScoreReport | null;
  readonly tests: readonly AcceptanceTestOnBase[];
}

export function gateCommands(settings: GateSettings, manifest: AcceptanceManifest): readonly NamedCommand[] {
  const command = acceptanceCommand(manifest);
  const acceptance = command === null ? [] : [{ name: GATE_STEP_NAMES.acceptance, run: command }];
  return [...settings.commandsBeforeAcceptance, ...acceptance, ...settings.commandsAfterAcceptance];
}

/** The gate the agent's Stop hook runs: inside a stack, with its variables and the host's loopback. */
export function composeGateCommand(
  settings: GateSettings,
  manifest: AcceptanceManifest,
  sandbox: CommandSandbox,
  worktreePath: string,
  stack: StackScope | null = null,
): string | null {
  const commands = gateCommands(settings, manifest);
  if (commands.length === 0) return null;
  const chain = commands
    .map((command) => {
      const scope = { workingDirectory: worktreePath, network: accessOf(command).network, hostLoopback: stack !== null };
      return `(${shellCommandLine(sandbox.confine(shellInvocation(command.run), scope))})`;
    })
    .join(COMMAND_JOINER);
  const exports = exportStatement({ ...settings.environment, ...(stack?.environment ?? {}) });
  return exports === null ? chain : `${exports}${STATEMENT_SEPARATOR}${chain}`;
}

function passed(name: string): GateStepResult {
  return { name, outcome: 'passed', detail: STEP_PASSED };
}

function failed(name: string, detail: string): GateStepResult {
  return { name, outcome: 'failed', detail };
}

function skipped(name: string): GateStepResult {
  return { name, outcome: 'skipped', detail: SKIPPED_AFTER_FAILURE };
}

function resultOf(steps: readonly GateStepResult[]): GateResult {
  return { passed: steps.every((step) => step.outcome !== 'failed'), steps };
}

export function describeViolations(violations: readonly FrozenCheckViolation[]): string {
  return `Frozen acceptance checks no longer match their frozen content: ${violations
    .map((violation) => `${violation.path} (${violation.kind})`)
    .join(', ')}`;
}

interface StepExecution {
  readonly step: GateStepResult;
  readonly log: string;
  readonly tests: readonly AcceptanceTestOnBranch[];
}

/** The steps of one gate run as they are recorded: their results, their logs and the tests of the acceptance step. */
class GateProgress {
  readonly steps: GateStepResult[];
  readonly log: string[] = [];
  tests: readonly AcceptanceTestOnBranch[] = [];
  failed = false;

  constructor(steps: readonly GateStepResult[]) {
    this.steps = [...steps];
  }

  record(execution: StepExecution): void {
    this.log.push(execution.log);
    this.steps.push(execution.step);
    if (execution.tests.length > 0) this.tests = execution.tests;
    this.failed = this.failed || execution.step.outcome === 'failed';
  }

  skip(commands: readonly NamedCommand[]): void {
    for (const command of commands) this.steps.push(skipped(command.name));
  }
}

function structuredRunnerOf(manifest: AcceptanceManifest, base: BaseResults): StructuredTestRunner | null {
  const runner = manifest.runner;
  return runner !== null && isStructuredRunner(runner) && base.tests.length > 0 ? runner : null;
}

export class OrchestratorGate {
  private readonly sourceControl: SourceControl;
  private readonly files: WorkspaceFiles;
  private readonly shell: ShellCommands;
  private readonly settings: GateSettings;
  private readonly setupCommands: readonly NamedCommand[];
  private readonly acceptance: StructuredAcceptance;

  constructor(
    sourceControl: SourceControl,
    files: WorkspaceFiles,
    shell: ShellCommands,
    settings: GateSettings,
    setupCommands: readonly NamedCommand[],
  ) {
    this.sourceControl = sourceControl;
    this.files = files;
    this.shell = shell;
    this.settings = settings;
    this.setupCommands = setupCommands;
    this.acceptance = new StructuredAcceptance(shell, files);
  }

  async verifyFrozenChecks(worktree: Worktree, frozen: readonly FrozenCheck[]): Promise<readonly FrozenCheckViolation[]> {
    const presence = await Promise.all(frozen.map(async (check) => ({ check, present: await this.files.exists(worktree.path, check.path) })));
    const missing = presence.filter((entry) => !entry.present).map((entry): FrozenCheckViolation => ({ path: entry.check.path, kind: 'missing' }));
    const present = presence.filter((entry) => entry.present).map((entry) => entry.check);
    const hashes = await this.sourceControl.hashFiles(worktree, present.map((check) => check.path));
    const modified = present
      .filter((check) => hashes.find((hash) => hash.path === check.path)?.sha256 !== check.sha256)
      .map((check): FrozenCheckViolation => ({ path: check.path, kind: 'modified' }));
    return [...missing, ...modified].sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Runs the setup, then the gate commands inside the issue's stack when its checks need one. */
  async run(
    worktree: Worktree,
    frozen: readonly FrozenCheck[],
    manifest: AcceptanceManifest,
    type: IssueTypeDefinition,
    base: BaseResults,
    stack: StackAround = NO_STACK,
  ): Promise<GateRun> {
    const inside = gateCommands(this.settings, manifest);
    const commands = [...this.setupCommands, ...inside];
    const violations = await this.verifyFrozenChecks(worktree, frozen);
    if (violations.length > 0) {
      const steps = [failed(GATE_STEP_NAMES.frozenChecks, describeViolations(violations)), ...commands.map((command) => skipped(command.name))];
      return { result: resultOf(steps), violations, log: describeViolations(violations), scoreReport: null, tests: [] };
    }
    const progress = new GateProgress([passed(GATE_STEP_NAMES.frozenChecks)]);
    const runner = structuredRunnerOf(manifest, base);
    await this.runSteps(progress, worktree, this.setupCommands, manifest, runner, base, this.shell);
    if (progress.failed) progress.skip(inside);
    else await this.runInsideStack(progress, worktree, inside, manifest, runner, base, stack);
    const scorePath = scoreOutputPath(manifest, type);
    const scoreReport = scorePath === null ? null : await this.scoreStep(worktree, scorePath, base.scoreReport, progress.failed, progress.steps);
    return { result: resultOf(progress.steps), violations, log: progress.log.join(LOG_SEPARATOR), scoreReport, tests: progress.tests };
  }

  private async runInsideStack(
    progress: GateProgress,
    worktree: Worktree,
    commands: readonly NamedCommand[],
    manifest: AcceptanceManifest,
    runner: StructuredTestRunner | null,
    base: BaseResults,
    stack: StackAround,
  ): Promise<void> {
    try {
      await stack((scope) => this.runSteps(progress, worktree, commands, manifest, runner, base, scope?.shell ?? this.shell));
    } catch (error) {
      if (!(error instanceof StackStartError)) throw error;
      progress.record({ step: failed(GATE_STEP_NAMES.stack, error.reason), log: error.reason, tests: [] });
      progress.skip(commands);
    }
  }

  private async runSteps(
    progress: GateProgress,
    worktree: Worktree,
    commands: readonly NamedCommand[],
    manifest: AcceptanceManifest,
    runner: StructuredTestRunner | null,
    base: BaseResults,
    shell: ShellCommands,
  ): Promise<void> {
    for (const command of commands) {
      if (progress.failed) {
        progress.skip([command]);
        continue;
      }
      progress.record(
        command.name === GATE_STEP_NAMES.acceptance && runner !== null
          ? await this.structuredAcceptanceStep(worktree, manifest, runner, base.tests, shell)
          : await this.commandStep(worktree, command, shell),
      );
    }
  }

  private async commandStep(worktree: Worktree, command: NamedCommand, shell: ShellCommands): Promise<StepExecution> {
    const outcome = await shell.execute(command.run, worktree.path, accessOf(command));
    const described = describeOutcome(command.run, outcome);
    const succeeded = outcome.kind === 'completed' && outcome.exitCode === EXIT_CODE_SUCCESS;
    return {
      step: succeeded ? passed(command.name) : failed(command.name, `${command.name} failed (${command.run}):\n${tailLines(described)}`),
      log: described,
      tests: [],
    };
  }

  private async structuredAcceptanceStep(
    worktree: Worktree,
    manifest: AcceptanceManifest,
    runner: StructuredTestRunner,
    baseTests: readonly AcceptanceTestOnBase[],
    shell: ShellCommands,
  ): Promise<StepExecution> {
    const name = GATE_STEP_NAMES.acceptance;
    const run = await this.acceptance.run(worktree, manifest, runner, shell);
    if (run === null) return { step: passed(name), log: '', tests: [] };
    const described = describeOutcome(run.command, run.outcome);
    if (run.report === null) {
      return { step: failed(name, `${name} failed: ${run.reportProblem ?? 'no report'}\n${tailLines(described)}`), log: described, tests: [] };
    }
    const evaluation = evaluateBranchRun(baseTests, run.report);
    const exited = run.outcome.kind === 'completed' && run.outcome.exitCode === EXIT_CODE_SUCCESS;
    if (evaluation.passed && exited) return { step: passed(name), log: described, tests: evaluation.tests };
    const problems = evaluation.problems.length === 0 ? [`the acceptance command did not succeed`] : evaluation.problems;
    const detail = `${name} failed (${run.command}):\n${problems.map((problem) => `- ${problem}`).join(NEWLINE)}\n${tailLines(described)}`;
    return { step: failed(name, detail), log: described, tests: evaluation.tests };
  }

  private async scoreStep(
    worktree: Worktree,
    scorePath: string,
    baseScoreReport: ScoreReport | null,
    earlierFailure: boolean,
    steps: GateStepResult[],
  ): Promise<ScoreReport | null> {
    if (earlierFailure) {
      steps.push(skipped(GATE_STEP_NAMES.skillEval));
      return null;
    }
    const reading = readScoreReport(scorePath, await this.files.readText(worktree.path, scorePath));
    if (!reading.valid) {
      steps.push(failed(GATE_STEP_NAMES.skillEval, reading.problem));
      return null;
    }
    if (baseScoreReport === null) {
      steps.push(failed(GATE_STEP_NAMES.skillEval, 'no base score was recorded before the change'));
      return reading.report;
    }
    const verdict = evaluateSkillEval(skillEvalCases(baseScoreReport, reading.report));
    steps.push(verdict.passed ? passed(GATE_STEP_NAMES.skillEval) : failed(GATE_STEP_NAMES.skillEval, verdict.reasons.join('\n')));
    return reading.report;
  }
}
