import type { CheckConclusion, ForgePullRequestState } from '@agent-factory/application';
import { CHECK_RUN_COMPLETED_STATUS } from './constants.ts';

export function conclusionOfCheckRun(status: string, conclusion: string | null): CheckConclusion {
  if (status !== CHECK_RUN_COMPLETED_STATUS || conclusion === null) return 'pending';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'neutral') return 'neutral';
  if (conclusion === 'skipped') return 'skipped';
  if (conclusion === 'cancelled') return 'cancelled';
  return 'failure';
}

export function conclusionOfCommitStatus(state: 'success' | 'failure' | 'error' | 'pending'): CheckConclusion {
  if (state === 'success') return 'success';
  if (state === 'pending') return 'pending';
  return 'failure';
}

/** How long a check run took, from the start and end the forge gives; null while it runs or when either is missing. */
export function checkRunDuration(startedAt: string | null, completedAt: string | null): number | null {
  if (startedAt === null || completedAt === null) return null;
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

/** A closed pull request was merged when the forge gives its merge time; otherwise it was closed without a merge. */
export function forgePullRequestState(state: 'open' | 'closed', mergedAt: string | null): ForgePullRequestState {
  if (state === 'open') return 'open';
  return mergedAt === null ? 'closed' : 'merged';
}
