import type { AgentRunOutcome, RunView } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { isLiveRun } from '../../model/projects.ts';
import type { BadgeTone } from '../../ui/components/Badge.tsx';

/** Runs are numbered from zero by the factory; people count attempts from one. */
const FIRST_ATTEMPT_NUMBER = 1;
const RESUMABLE_STATUSES: readonly RunView['status'][] = ['stopped', 'failed'];
const ISSUE_SUBJECT_KIND: RunView['subject']['kind'] = 'issue';

/** A run that is going or waiting for an answer can be stopped; one that ended cannot. */
export function canStopRun(run: Pick<RunView, 'status'>): boolean {
  return isLiveRun(run);
}

export function isIssueRun(run: Pick<RunView, 'subject'>): boolean {
  return run.subject.kind === ISSUE_SUBJECT_KIND;
}

/** Only the run of an issue resumes: the factory resumes the issue, and the other subjects are asked for again. */
export function canResumeRun(run: Pick<RunView, 'status' | 'subject'>): boolean {
  return RESUMABLE_STATUSES.includes(run.status) && isIssueRun(run);
}

/** While a run is live its cost is only known once the run ends; a figure of zero then stands for nothing yet. */
export function isCostPending(run: Pick<RunView, 'status' | 'costUsd'>): boolean {
  return isLiveRun(run) && run.costUsd === 0;
}

export function attemptNumber(run: Pick<RunView, 'attempt'>): number {
  return run.attempt + FIRST_ATTEMPT_NUMBER;
}

const OUTCOME_TONES: Readonly<Record<AgentRunOutcome, BadgeTone>> = {
  success: 'success',
  'decision-requested': 'waiting',
  'max-turns': 'failed',
  'budget-exceeded': 'failed',
  error: 'failed',
  timeout: 'failed',
  aborted: 'blocked',
};

export function outcomeTone(outcome: AgentRunOutcome): BadgeTone {
  return OUTCOME_TONES[outcome];
}

export type RunTiming =
  | { readonly kind: 'running'; readonly elapsedMs: number }
  /** The agent stopped to ask a question: the time it worked is fixed, and `since` is when it asked. */
  | { readonly kind: 'waiting'; readonly elapsedMs: number; readonly since: string | null }
  | { readonly kind: 'ended'; readonly elapsedMs: number; readonly endedAt: string }
  | { readonly kind: 'unknown-end' };

/** How long a run worked, and whether that figure is still growing. */
export function describeTiming(run: Pick<RunView, 'status' | 'startedAt' | 'endedAt' | 'pendingQuestion'>, now: number): RunTiming {
  const startedAt = toEpoch(run.startedAt);
  if (run.status === 'waiting') {
    const since = run.pendingQuestion?.askedAt ?? run.endedAt;
    return { kind: 'waiting', elapsedMs: (since === null ? now : toEpoch(since)) - startedAt, since };
  }
  if (run.endedAt !== null) return { kind: 'ended', elapsedMs: toEpoch(run.endedAt) - startedAt, endedAt: run.endedAt };
  return run.status === 'running' ? { kind: 'running', elapsedMs: now - startedAt } : { kind: 'unknown-end' };
}
