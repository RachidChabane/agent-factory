import type { CheckConclusion } from '@agent-factory/application';
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
