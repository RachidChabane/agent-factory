import type { EffortLevel } from './model.ts';

export const MAX_IN_SESSION_CORRECTIONS = 2;
export const MAX_FRESH_RESTARTS = 1;

export interface AttemptHistory {
  readonly inSessionCorrections: number;
  readonly freshRestarts: number;
}

export interface EscalationProfile {
  readonly model: string;
  readonly effort: EffortLevel;
}

export type RetryDecision =
  | { readonly action: 'resume-same-session' }
  | { readonly action: 'fresh-session-escalated'; readonly profile: EscalationProfile }
  | { readonly action: 'needs-human' };

export function decideNextAttempt(history: AttemptHistory, escalation: EscalationProfile): RetryDecision {
  if (history.freshRestarts >= MAX_FRESH_RESTARTS) {
    return { action: 'needs-human' };
  }
  if (history.inSessionCorrections < MAX_IN_SESSION_CORRECTIONS) {
    return { action: 'resume-same-session' };
  }
  return { action: 'fresh-session-escalated', profile: escalation };
}
