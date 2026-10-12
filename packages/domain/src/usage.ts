/**
 * Subscription usage of a Claude account, as reported by the CLI's usage report or by the
 * rate-limit events of an agent run. Readings are classified by the limit's kind, never by
 * its display label, and always carry the time they were read.
 */
export const USAGE_LIMIT_KINDS = ['session', 'weekly_all', 'weekly_scoped'] as const;
export type UsageLimitKind = (typeof USAGE_LIMIT_KINDS)[number];

export const USAGE_SOURCES = ['usage-report', 'agent-stream'] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

export const USAGE_FRESHNESS = ['fresh', 'stale', 'window-reset'] as const;
export type UsageFreshness = (typeof USAGE_FRESHNESS)[number];

export const PERCENT_SCALE = 100;
export const DEFAULT_SESSION_PAUSE_RATIO = 0.9;
export const DEFAULT_WEEKLY_PAUSE_RATIO = 0.85;

export interface UsageLimitReading {
  readonly kind: UsageLimitKind;
  /** The model a `weekly_scoped` limit applies to; null for the other kinds. */
  readonly scope: string | null;
  /** Utilisation of the window as a ratio from 0 to 1. */
  readonly utilization: number;
  readonly resetsAt: Date | null;
}

export interface UsageReading {
  readonly account: string;
  readonly source: UsageSource;
  readonly readAt: Date;
  readonly limits: readonly UsageLimitReading[];
}

export type UsageThresholds = Readonly<Record<UsageLimitKind, number>>;

export const DEFAULT_USAGE_THRESHOLDS: UsageThresholds = {
  session: DEFAULT_SESSION_PAUSE_RATIO,
  weekly_all: DEFAULT_WEEKLY_PAUSE_RATIO,
  weekly_scoped: DEFAULT_WEEKLY_PAUSE_RATIO,
};

export interface ObservedLimit extends UsageLimitReading {
  readonly source: UsageSource;
  readonly readAt: Date;
  readonly freshness: UsageFreshness;
}

export type UsageAdmission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: string; readonly resumesAt: Date };

function limitKey(limit: UsageLimitReading): string {
  return `${limit.kind}\u0000${limit.scope ?? ''}`;
}

export function utilizationFromPercent(percent: number): number {
  return Math.min(1, Math.max(0, percent / PERCENT_SCALE));
}

export function percentOf(utilization: number): number {
  return Math.round(utilization * PERCENT_SCALE);
}

/**
 * A reading whose window has reset since it was taken says nothing about the current window;
 * a reading older than the staleness limit is still the best estimate, but is shown as stale.
 */
export function freshnessOf(limit: UsageLimitReading, readAt: Date, now: Date, staleAfterMs: number): UsageFreshness {
  if (limit.resetsAt !== null && limit.resetsAt.getTime() <= now.getTime()) return 'window-reset';
  return now.getTime() - readAt.getTime() > staleAfterMs ? 'stale' : 'fresh';
}

/** The latest observation of each limit (kind and scope) across every reading of one account. */
export function latestLimits(readings: readonly UsageReading[], now: Date, staleAfterMs: number): readonly ObservedLimit[] {
  const latest = new Map<string, ObservedLimit>();
  const ordered = [...readings].sort((left, right) => left.readAt.getTime() - right.readAt.getTime());
  for (const reading of ordered) {
    for (const limit of reading.limits) {
      latest.set(limitKey(limit), {
        ...limit,
        source: reading.source,
        readAt: reading.readAt,
        freshness: freshnessOf(limit, reading.readAt, now, staleAfterMs),
      });
    }
  }
  return [...latest.values()].sort((left, right) => USAGE_LIMIT_KINDS.indexOf(left.kind) - USAGE_LIMIT_KINDS.indexOf(right.kind));
}

function describeLimit(limit: ObservedLimit, threshold: number): string {
  const scope = limit.scope === null ? '' : ` (${limit.scope})`;
  return `${limit.kind}${scope} at ${percentOf(limit.utilization)}% (pause at ${percentOf(threshold)}%)`;
}

/**
 * An account is refused while any window that has not reset since its reading is at or above
 * its threshold; it resumes when the last of those windows resets.
 */
export function assessUsage(limits: readonly ObservedLimit[], thresholds: UsageThresholds, now: Date): UsageAdmission {
  const exceeded = limits.filter((limit) => limit.freshness !== 'window-reset' && limit.utilization >= thresholds[limit.kind]);
  if (exceeded.length === 0) return { admitted: true };
  // A window without a known reset time is re-evaluated at the next reading.
  const resumesAt = new Date(Math.max(...exceeded.map((limit) => limit.resetsAt?.getTime() ?? now.getTime())));
  return { admitted: false, reason: exceeded.map((limit) => describeLimit(limit, thresholds[limit.kind])).join(', '), resumesAt };
}

/** True when some limit of the account needs a new reading to be shown or trusted. */
export function needsRefresh(limits: readonly ObservedLimit[]): boolean {
  return limits.length === 0 || limits.some((limit) => limit.freshness !== 'fresh');
}
