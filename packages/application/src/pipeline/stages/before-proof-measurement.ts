import { evaluateBaseRun, evaluateBeforeProof, isStructuredRunner, proofExpectation } from '@agent-factory/domain';
import type { BeforeProofEvaluation, IssueSpec, StructuredTestRunner } from '@agent-factory/domain';
import {
  acceptanceCommand,
  criterionChecks,
  FACTORY_WORK_DIRECTORY,
  scoreOutputPath,
  type AcceptanceManifest,
} from '../../acceptance/acceptance-manifest.ts';
import { readScoreReport, targetedScore, type ScoreReport } from '../../acceptance/score-report.ts';
import type { Worktree } from '../../ports.ts';
import type { BeforeProofRecord } from '../journal-events.ts';
import { EscalationRequiredError } from '../pipeline-errors.ts';
import { describeOutcome, EXIT_CODE_SUCCESS, tailLines, type ShellCommands } from '../shell-commands.ts';
import type { StageContext } from './stage.ts';
import { assertOnlyChecksChanged, issueTypeOfSpec } from './stage-support.ts';

export const BEFORE_PROOF_LOG = 'before-proof.log';
const NEWLINE = '\n';
const WRONG_REASON_HEADER = 'the frozen checks are not red for the right reason on base:';

function wrongReason(problems: readonly string[]): BeforeProofEvaluation {
  return { valid: false, reason: `${WRONG_REASON_HEADER}${NEWLINE}${problems.map((problem) => `- ${problem}`).join(NEWLINE)}` };
}

export async function measureBeforeProof(context: StageContext, worktree: Worktree, spec: IssueSpec, manifest: AcceptanceManifest): Promise<BeforeProofRecord> {
  const { toolkit, journal } = context;
  const { dependencies } = toolkit;
  await dependencies.files.remove(worktree.path, FACTORY_WORK_DIRECTORY);
  await toolkit.evidence.clearOutputs(worktree, manifest, issueTypeOfSpec(context, spec));
  await assertOnlyChecksChanged(context, worktree, manifest, 'the acceptance-author changed files outside its checks');
  const command = acceptanceCommand(manifest);
  if (command === null) {
    const evaluation = evaluateBeforeProof(proofExpectation(issueTypeOfSpec(context, spec).proof), { checksExpressible: false, checksFailedOnBase: false, baseScore: null });
    return {
      checksExpressible: false,
      exitCode: null,
      checksFailedOnBase: false,
      scoreReport: null,
      baseScore: null,
      logName: null,
      evaluation,
      evidence: [],
      runner: manifest.runner,
      tests: [],
    };
  }
  const type = issueTypeOfSpec(context, spec);
  return toolkit.stacks.around(context.writer, journal.issueNumber, type.id, worktree.path, (stack) =>
    measureWith(context, worktree, spec, manifest, command, stack?.shell ?? toolkit.shell),
  );
}

async function measureWith(
  context: StageContext,
  worktree: Worktree,
  spec: IssueSpec,
  manifest: AcceptanceManifest,
  command: string,
  shell: ShellCommands,
): Promise<BeforeProofRecord> {
  const { toolkit, journal } = context;
  const { dependencies } = toolkit;
  const runner = manifest.runner;
  if (runner !== null && isStructuredRunner(runner)) return measureStructured(context, worktree, spec, manifest, runner, shell);
  const outcome = await shell.execute(command, worktree.path);
  await dependencies.logs.write(journal.issueNumber, BEFORE_PROOF_LOG, describeOutcome(command, outcome));
  if (outcome.kind === 'not-runnable') {
    throw new EscalationRequiredError(
      `the acceptance command could not run on the base (${outcome.reason}):\n${tailLines(describeOutcome(command, outcome))}`,
    );
  }
  const scoreReport = await baseScoreReport(context, worktree, manifest, spec);
  const baseScore = scoreReport === null ? null : targetedScore(scoreReport);
  const evidence = await toolkit.evidence.capture(worktree, journal.issueNumber, 'before', manifest);
  await toolkit.evidence.clearOutputs(worktree, manifest, issueTypeOfSpec(context, spec));
  await assertOnlyChecksChanged(context, worktree, manifest, 'running the checks on the base left changes outside the checks');
  const checksFailedOnBase = outcome.exitCode !== EXIT_CODE_SUCCESS;
  return {
    checksExpressible: true,
    exitCode: outcome.exitCode,
    checksFailedOnBase,
    scoreReport,
    baseScore,
    logName: BEFORE_PROOF_LOG,
    evaluation: evaluateBeforeProof(proofExpectation(issueTypeOfSpec(context, spec).proof), { checksExpressible: true, checksFailedOnBase, baseScore }),
    evidence: [...evidence],
    runner: manifest.runner,
    tests: [],
  };
}

async function measureStructured(
  context: StageContext,
  worktree: Worktree,
  spec: IssueSpec,
  manifest: AcceptanceManifest,
  runner: StructuredTestRunner,
  shell: ShellCommands,
): Promise<BeforeProofRecord> {
  const { toolkit, journal } = context;
  const { dependencies } = toolkit;
  const run = await toolkit.acceptance.run(worktree, manifest, runner, shell);
  if (run === null) throw new EscalationRequiredError('the acceptance manifest declares a runner but no command');
  const described = describeOutcome(run.command, run.outcome);
  await dependencies.logs.write(journal.issueNumber, BEFORE_PROOF_LOG, described);
  if (run.outcome.kind === 'not-runnable') {
    throw new EscalationRequiredError(`the acceptance command could not run on the base (${run.outcome.reason}):\n${tailLines(described)}`);
  }
  const evidence = await toolkit.evidence.capture(worktree, journal.issueNumber, 'before', manifest);
  await toolkit.evidence.clearOutputs(worktree, manifest, issueTypeOfSpec(context, spec));
  await assertOnlyChecksChanged(context, worktree, manifest, 'running the checks on the base left changes outside the checks');
  const base = run.report === null ? null : evaluateBaseRun(run.report, criterionChecks(manifest));
  const problems = base === null ? [run.reportProblem ?? `${runner} wrote no report`] : base.problems;
  const checksFailedOnBase = base !== null && base.failingCriteria.length > 0;
  return {
    checksExpressible: true,
    exitCode: run.outcome.exitCode,
    checksFailedOnBase,
    scoreReport: null,
    baseScore: null,
    logName: BEFORE_PROOF_LOG,
    evaluation: problems.length > 0 ? wrongReason(problems) : evaluateBeforeProof(proofExpectation(issueTypeOfSpec(context, spec).proof), { checksExpressible: true, checksFailedOnBase, baseScore: null }),
    evidence: [...evidence],
    runner,
    tests: (base?.tests ?? []).map((test) => ({ ...test, criteria: [...test.criteria] })),
  };
}

async function baseScoreReport(context: StageContext, worktree: Worktree, manifest: AcceptanceManifest, spec: IssueSpec): Promise<ScoreReport | null> {
  const path = scoreOutputPath(manifest, issueTypeOfSpec(context, spec));
  if (path === null) return null;
  const reading = readScoreReport(path, await context.toolkit.dependencies.files.readText(worktree.path, path));
  if (!reading.valid) throw new EscalationRequiredError(`the base score could not be read: ${reading.problem}`);
  return reading.report;
}
