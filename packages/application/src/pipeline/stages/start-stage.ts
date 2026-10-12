import { PIPELINE_EVENTS } from '../journal-events.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';
import { requireBranch, requireSpec } from './journal-facts.ts';

const OPEN_ISSUE_STATE = 'open';

export class StartStage implements PipelineStage {
  readonly handles = ['spec-validated', 'blocked'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const { journal, writer, toolkit } = context;
    const spec = requireSpec(journal);
    const blockers = await this.openBlockers(context, spec.dependsOn);
    if (blockers.length > 0) {
      if (journal.state !== 'blocked') {
        await writer.transition('blocked', `blocked by ${blockers.map((number) => `#${number}`).join(', ')}`);
      }
      return { kind: 'stopped', outcome: { kind: 'blocked', issueNumber: journal.issueNumber, blockers } };
    }
    if (journal.state === 'blocked') {
      await writer.transition('spec-validated', 'every blocking issue is closed');
      return ADVANCED;
    }
    if (journal.worktree === null) {
      const worktree = await toolkit.dependencies.pool.acquire(journal.issueNumber, requireBranch(journal));
      await writer.record(PIPELINE_EVENTS.worktreeAcquired, worktree);
    }
    await writer.transition('authoring-checks', 'worktree ready');
    return ADVANCED;
  }

  private async openBlockers(context: StageContext, dependsOn: readonly number[]): Promise<readonly number[]> {
    const issues = await Promise.all(dependsOn.map((number) => context.toolkit.dependencies.github.getIssue(number)));
    return issues.filter((issue) => issue.state === OPEN_ISSUE_STATE).map((issue) => issue.number);
  }
}
