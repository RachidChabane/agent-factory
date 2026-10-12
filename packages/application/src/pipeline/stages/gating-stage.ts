import { gateFailureSummary } from '../failure-summary.ts';
import { describeViolations } from '../gate-runner.ts';
import { PIPELINE_EVENTS } from '../journal-events.ts';
import { EscalationRequiredError } from '../pipeline-errors.ts';
import { currentAttempt, gateRecord } from '../pipeline-journal.ts';
import { settleFailure } from '../retry.ts';
import { leasedWorktree, requireBeforeProof, requireFrozen, requireManifest, requireSpec } from './journal-facts.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';
import { issueTypeOfSpec } from './stage-support.ts';

export const GATE_LOG_PREFIX = 'gate-attempt-';
export const LOG_SUFFIX = '.log';

export function gateLogName(attempt: number): string {
  return `${GATE_LOG_PREFIX}${attempt + 1}${LOG_SUFFIX}`;
}

export class GatingStage implements PipelineStage {
  readonly handles = ['gating'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const { journal, writer } = context;
    const attempt = currentAttempt(journal);
    const recorded = gateRecord(journal, attempt);
    if (recorded === null) {
      await this.runGate(context, attempt);
      return ADVANCED;
    }
    if (recorded.violations.length > 0) throw new EscalationRequiredError(describeViolations(recorded.violations));
    if (recorded.result.passed) {
      await writer.transition('reviewing', `the orchestrator gate passed on attempt ${attempt + 1}`);
      return ADVANCED;
    }
    await settleFailure(context, attempt, { source: 'gate', summary: gateFailureSummary(recorded.result) });
    return ADVANCED;
  }

  private async runGate(context: StageContext, attempt: number): Promise<void> {
    const { journal, writer, toolkit } = context;
    const spec = requireSpec(journal);
    const manifest = requireManifest(journal);
    const worktree = await leasedWorktree(context);
    const beforeProof = requireBeforeProof(journal);
    const type = issueTypeOfSpec(context, spec);
    const run = await toolkit.gate.run(worktree, requireFrozen(journal).checks, manifest, type, { scoreReport: beforeProof.scoreReport, tests: beforeProof.tests });
    const logName = gateLogName(attempt);
    await toolkit.dependencies.logs.write(journal.issueNumber, logName, run.log);
    const evidence = run.result.passed ? await toolkit.evidence.capture(worktree, journal.issueNumber, 'after', manifest) : [];
    await toolkit.evidence.clearOutputs(worktree, manifest, type);
    await writer.record(PIPELINE_EVENTS.gateCompleted, {
      attempt,
      result: run.result,
      violations: run.violations,
      logName,
      scoreReport: run.scoreReport,
      evidence,
      tests: run.tests,
    });
  }
}
