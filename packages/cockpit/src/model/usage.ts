import type { UsageFreshness } from '@agent-factory/domain';
import type { UsageAccountView, UsageLimitView } from '../contract/index.ts';
import { toEpoch } from '../i18n/formatters.ts';

const NEAR_PAUSE_RATIO = 0.85;

/** Whether the latest attempt to read an account's usage failed, which is when its failure is still news. */
export function latestReadFailed(account: Pick<UsageAccountView, 'readAt' | 'lastFailure'>): boolean {
  if (account.lastFailure === null) return false;
  return account.readAt === null || toEpoch(account.lastFailure.at) > toEpoch(account.readAt);
}

/**
 * The freshness of a limit at the time it is drawn: a window whose reset time has passed says
 * nothing about the current window, whatever the snapshot said when it was generated.
 */
export function effectiveFreshness(limit: Pick<UsageLimitView, 'freshness' | 'resetsAt'>, now: number): UsageFreshness {
  if (limit.freshness === 'window-reset') return 'window-reset';
  if (limit.resetsAt !== null && toEpoch(limit.resetsAt) <= now) return 'window-reset';
  return limit.freshness;
}

/** The limits of an account whose utilization can be trusted as current: read recently and not reset since. */
export function currentLimits(account: Pick<UsageAccountView, 'limits'>, now: number): readonly UsageLimitView[] {
  return account.limits.filter((limit) => effectiveFreshness(limit, now) === 'fresh');
}

export type LimitTone = 'success' | 'running' | 'failed';

/** A limit is shown in red once it reaches the utilization at which the factory pauses, in amber when it is close. */
export function limitTone(limit: Pick<UsageLimitView, 'utilization' | 'pauseAt'>): LimitTone {
  if (limit.utilization >= limit.pauseAt) return 'failed';
  return limit.utilization >= limit.pauseAt * NEAR_PAUSE_RATIO ? 'running' : 'success';
}
