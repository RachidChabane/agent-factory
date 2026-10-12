import { evaluateBranchRun, evaluateSkillEval, isStructuredRunner } from '@agent-factory/domain';
import type { AcceptanceTestOnBase, AcceptanceTestOnBranch, FrozenCheck, GateResult, GateStepResult, IssueTypeDefinition, StructuredTestRunner } from '@agent-factory/domain';
import { acceptanceCommand, scoreOutputPath, type AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import { shellCommandLine, shellQuote } from '../acceptance/shell-quote.ts';
import { readScoreReport, skillEvalCases, type ScoreReport } from '../acceptance/score-report.ts';
import type { CommandSandbox, SourceControl, WorkspaceFiles, Worktree } from '../ports.ts';
import type { FrozenCheckViolation } from './journal-events.ts';
import type { GateSettings, NamedCommand } from './pipeline-settings.ts';
import { accessOf, describeOutcome, EXIT_CODE_SUCCESS, shellInvocation, tailLines, type ShellCommands } from './shell-commands.ts';
import { StructuredAcceptance } from './structured-acceptance.ts';

export const GATE_STEP_NAMES = {
  frozenChecks: 'frozen-checks',
  acceptance: 'acceptance',
  skillEval: 'skill-eval',
} as const;

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

export function composeGateCommand(settings: GateSettings, manifest: AcceptanceManifest, sandbox: CommandSandbox, worktreePath: string): string | null {
  const commands = gateCommands(settings, manifest);
  if (commands.length === 0) return null;
  const chain = commands
    .map((command) => {
      const confined = sandbox.confine(shellInvocation(command.run), { workingDirectory: worktreePath, network: accessOf(command).network });
      return `(${shellCommandLine(confined)})`;
    })
    .join(COMMAND_JOINER);
  const exports = exportStatement(settings.environment);
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

  async run(worktree: Worktree, frozen: readonly FrozenCheck[], manifest: AcceptanceManifest, type: IssueTypeDefinition, base: BaseResults): Promise<GateRun> {
    const commands = [...this.setupCommands, ...gateCommands(this.settings, manifest)];
    const violations = await this.verifyFrozenChecks(worktree, frozen);
    if (violations.length > 0) {
      const steps = [failed(GATE_STEP_NAMES.frozenChecks, describeViolations(violations)), ...commands.map((command) => skipped(command.name))];
      return { result: resultOf(steps), violations, log: describeViolations(violations), scoreReport: null, tests: [] };
    }
    const steps: GateStepResult[] = [passed(GATE_STEP_NAMES.frozenChecks)];
    const log: string[] = [];
    let tests: readonly AcceptanceTestOnBranch[] = [];
    let failure = false;
    const runner = structuredRunnerOf(manifest, base);
    for (const command of commands) {
      if (failure) {
        steps.push(skipped(command.name));
        continue;
      }
      const execution =
        command.name === GATE_STEP_NAMES.acceptance && runner !== null
          ? await this.structuredAcceptanceStep(worktree, manifest, runner, base.tests)
          : await this.commandStep(worktree, command);
      log.push(execution.log);
      steps.push(execution.step);
      if (execution.tests.length > 0) tests = execution.tests;
      failure = execution.step.outcome === 'failed';
    }
    const scorePath = scoreOutputPath(manifest, type);
    const scoreReport = scorePath === null ? null : await this.scoreStep(worktree, scorePath, base.scoreReport, failure, steps);
    return { result: resultOf(steps), violations, log: log.join(LOG_SEPARATOR), scoreReport, tests };
  }

  private async commandStep(worktree: Worktree, command: NamedCommand): Promise<StepExecution> {
    const outcome = await this.shell.execute(command.run, worktree.path, accessOf(command));
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
  ): Promise<StepExecution> {
    const name = GATE_STEP_NAMES.acceptance;
    const run = await this.acceptance.run(worktree, manifest, runner);
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
