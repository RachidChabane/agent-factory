import { diffWithoutEvidence } from '../diff-evidence.ts';
import { agentFailureSummary, reviewFailureSummary } from '../failure-summary.ts';
import { blockingFindings, readReviewFindings } from '../../review/review-findings.ts';
import { PIPELINE_EVENTS } from '../journal-events.ts';
import { EscalationRequiredError } from '../pipeline-errors.ts';
import { currentAttempt, reviewRecord } from '../pipeline-journal.ts';
import { settleFailure } from '../retry.ts';
import { reviewerValues } from '../role-prompts.ts';
import { leasedWorktree, requireFrozen, requireSpec } from './journal-facts.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';
import { profileOf, readCheckContents } from './stage-support.ts';

export class ReviewingStage implements PipelineStage {
  readonly handles = ['reviewing'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const { journal, writer } = context;
    const attempt = currentAttempt(journal);
    const recorded = reviewRecord(journal, attempt);
    if (recorded === null) {
      await this.runReview(context, attempt);
      return ADVANCED;
    }
    const blocking = blockingFindings(recorded.findings);
    if (blocking.length > 0) {
      await settleFailure(context, attempt, { source: 'review', summary: reviewFailureSummary(blocking) });
      return ADVANCED;
    }
    await writer.transition('producing-evidence', `the review of attempt ${attempt + 1} found no blocking problem`);
    return ADVANCED;
  }

  private async runReview(context: StageContext, attempt: number): Promise<void> {
    const { journal, writer, toolkit } = context;
    const { dependencies, settings } = toolkit;
    const spec = requireSpec(journal);
    const worktree = await leasedWorktree(context);
    const diff = diffWithoutEvidence(await dependencies.sourceControl.diff(worktree));
    const checks = await readCheckContents(context, worktree, requireFrozen(journal));
    const profile = profileOf(context, 'reviewer');
    const result = await toolkit.agents.run(writer, {
      role: 'reviewer',
      profile,
      model: profile.model,
      effort: profile.effort,
      workingDirectory: worktree.path,
      prompt: dependencies.roles.render('reviewer', reviewerValues(settings.repository, spec, checks, diff)),
      resumeSessionId: null,
      frozenChecks: [],
      gateCommand: null,
      attempt,
      branch: journal.branch,
      decisionRequestPath: null,
    });
    if (result.outcome !== 'success') throw new EscalationRequiredError(agentFailureSummary('reviewer', result.outcome, result.finalText));
    const reading = readReviewFindings(result.finalText);
    if (!reading.valid) throw new EscalationRequiredError(`the reviewer answer is unusable: ${reading.problem}`);
    await writer.record(PIPELINE_EVENTS.reviewCompleted, { attempt, runId: result.runId, findings: reading.findings });
  }
}
