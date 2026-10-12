import {
  ACCEPTANCE_REPORT_DIRECTORY,
  criterionChecks,
  GATE_STEP_NAMES,
  gateCommands,
  readTestReport,
  structuredAcceptanceCommand,
  type AcceptanceManifest,
  type GateSettings,
  type NamedCommand,
} from '@agent-factory/application';
import {
  evaluateBaseRun,
  evaluateBranchRun,
  type AcceptanceTestOnBase,
  type BaseRunEvaluation,
  type BranchRunEvaluation,
  type GateStepOutcome,
  type TestRunReport,
} from '@agent-factory/domain';
import type { CommandResult, StoryWorkspace } from './story-workspace.ts';

const NODE_TEST_RUNNER = 'node-test';
const SUCCESS_EXIT_CODE = 0;

export class MissingAcceptanceCommandError extends Error {
  constructor() {
    super('the acceptance manifest declares no command');
    this.name = 'MissingAcceptanceCommandError';
  }
}

/** The text of every file a run was declared to write, by path; null for a file the run did not write. */
export type EvidenceFiles = ReadonlyMap<string, string | null>;

const NO_EVIDENCE: EvidenceFiles = new Map();

export interface AcceptanceRun {
  readonly outcome: CommandResult;
  readonly report: TestRunReport;
}

/** Runs the acceptance command the way the factory does: its reporters travel in the environment and the report is read back. */
function executeAcceptance(workspace: StoryWorkspace, manifest: AcceptanceManifest): AcceptanceRun {
  const plan = structuredAcceptanceCommand(manifest, NODE_TEST_RUNNER, workspace.directory);
  if (plan === null) throw new MissingAcceptanceCommandError();
  workspace.ensureDirectory(ACCEPTANCE_REPORT_DIRECTORY);
  const outcome = workspace.run(plan.command);
  const report = readTestReport(NODE_TEST_RUNNER, workspace.read(plan.reportPath), workspace.directory);
  workspace.remove([ACCEPTANCE_REPORT_DIRECTORY]);
  return { outcome, report };
}

/** The files the manifest declares as evidence, as they stand in the workspace. */
function captureEvidence(workspace: StoryWorkspace, manifest: AcceptanceManifest): EvidenceFiles {
  return new Map(manifest.evidence.map((path) => [path, workspace.readIfPresent(path)]));
}

function clearEvidence(workspace: StoryWorkspace, manifest: AcceptanceManifest): void {
  workspace.remove(manifest.evidence);
}

export interface BaseProof {
  readonly outcome: CommandResult;
  readonly evaluation: BaseRunEvaluation;
  readonly evidence: EvidenceFiles;
}

/**
 * What the factory records before the implementation: the checks must fail on assertions, each criterion at least once.
 * The evidence is kept right after the run, then the workspace is cleared of it.
 */
export function proveOnBase(workspace: StoryWorkspace, manifest: AcceptanceManifest): BaseProof {
  const run = executeAcceptance(workspace, manifest);
  const evidence = captureEvidence(workspace, manifest);
  clearEvidence(workspace, manifest);
  return { outcome: run.outcome, evaluation: evaluateBaseRun(run.report, criterionChecks(manifest)), evidence };
}

export interface GateStepResult {
  readonly name: string;
  readonly outcome: GateStepOutcome;
  readonly output: string;
}

export interface GateOutcome {
  readonly passed: boolean;
  readonly steps: readonly GateStepResult[];
  /** How the acceptance checks fared against the base proof; null when the gate has no acceptance step or never reached it. */
  readonly acceptance: BranchRunEvaluation | null;
  /** The evidence the gate wrote, kept when the gate passed; empty otherwise. */
  readonly evidence: EvidenceFiles;
}

interface StepExecution {
  readonly step: GateStepResult;
  readonly acceptance: BranchRunEvaluation | null;
}

function commandsOf(gate: GateSettings, manifest: AcceptanceManifest | null): readonly NamedCommand[] {
  if (manifest !== null) return gateCommands(gate, manifest);
  return [...gate.commandsBeforeAcceptance, ...gate.commandsAfterAcceptance];
}

function acceptanceExecution(workspace: StoryWorkspace, manifest: AcceptanceManifest, baseTests: readonly AcceptanceTestOnBase[]): StepExecution {
  const run = executeAcceptance(workspace, manifest);
  const evaluation = evaluateBranchRun(baseTests, run.report);
  const passed = evaluation.passed && run.outcome.exitCode === SUCCESS_EXIT_CODE;
  return { step: { name: GATE_STEP_NAMES.acceptance, outcome: passed ? 'passed' : 'failed', output: run.outcome.output }, acceptance: evaluation };
}

function shellExecution(workspace: StoryWorkspace, command: NamedCommand): StepExecution {
  const outcome = workspace.run(command.run);
  return { step: { name: command.name, outcome: outcome.exitCode === SUCCESS_EXIT_CODE ? 'passed' : 'failed', output: outcome.output }, acceptance: null };
}

/**
 * The gate of a project in the factory's order: the steps before the acceptance checks, the checks, then the steps after them.
 * Once every step has run, the evidence is kept when the gate passed and the workspace is cleared of it, as the factory does.
 */
export function runGate(
  workspace: StoryWorkspace,
  gate: GateSettings,
  manifest: AcceptanceManifest | null,
  baseTests: readonly AcceptanceTestOnBase[],
): GateOutcome {
  const steps: GateStepResult[] = [];
  let acceptance: BranchRunEvaluation | null = null;
  let failed = false;
  for (const command of commandsOf(gate, manifest)) {
    if (failed) {
      steps.push({ name: command.name, outcome: 'skipped', output: '' });
      continue;
    }
    const execution =
      manifest !== null && command.name === GATE_STEP_NAMES.acceptance ? acceptanceExecution(workspace, manifest, baseTests) : shellExecution(workspace, command);
    steps.push(execution.step);
    acceptance = execution.acceptance ?? acceptance;
    failed = execution.step.outcome === 'failed';
  }
  const evidence = failed || manifest === null ? NO_EVIDENCE : captureEvidence(workspace, manifest);
  if (manifest !== null) clearEvidence(workspace, manifest);
  return { passed: !failed, steps, acceptance, evidence };
}
