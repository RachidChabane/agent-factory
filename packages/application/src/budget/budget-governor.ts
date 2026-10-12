import {
  assessDailySpend,
  assessUsage,
  dailyCapAmount,
  isSameUtcDay,
  latestLimits,
  REASON_NO_ACCOUNT,
  type DailyCap,
  type ObservedLimit,
  type RateLimitSnapshot,
  type UsageLimitKind,
  type UsageLimitReading,
  type UsageReading,
  type UsageThresholds,
} from '@agent-factory/domain';
import type { Clock, EventStore, FactoryEventRecord } from '../ports.ts';
import { RUN_FINISHED_EVENT, RUN_SUBJECT_PREFIX, RunFinishedPayloadSchema } from '../runs/run-events.ts';
import { USAGE_READ_EVENT, USAGE_SUBJECT_PREFIX, usageSubject, UsageReadPayloadSchema, type UsageReadPayload } from './budget-events.ts';

export const DEFAULT_ACCOUNT_NAME = 'default';
const FIRST_SEQUENCE = 0;

/** How the rate-limit windows of an agent run's stream map onto the kinds of the usage report. */
const STREAM_WINDOW_KINDS: Readonly<Record<RateLimitSnapshot['window'], UsageLimitKind>> = {
  five_hour: 'session',
  seven_day: 'weekly_all',
};

export class BudgetExhaustedError extends Error {
  readonly reason: string;
  readonly resumesAt: Date;

  constructor(reason: string, resumesAt: Date) {
    super(`No agent run starts until ${resumesAt.toISOString()}: the subscription budget is spent (${reason})`);
    this.name = 'BudgetExhaustedError';
    this.reason = reason;
    this.resumesAt = resumesAt;
  }
}

export interface BudgetLimits {
  readonly thresholds: UsageThresholds;
  readonly dailyCap: DailyCap;
  readonly perRunCapUsd: number | null;
}

export interface BudgetGovernorSettings extends BudgetLimits {
  readonly accounts: readonly string[];
  /** A reading older than this is still used, but shown as stale and refreshed. */
  readonly staleAfterMs: number;
}

export interface AccountUsage {
  readonly account: string;
  readonly limits: readonly ObservedLimit[];
}

export type AccountChoice =
  | { readonly kind: 'selected'; readonly account: string }
  | { readonly kind: 'exhausted'; readonly reason: string; readonly resumesAt: Date };

export type AccountSelection = { readonly account: string | null; readonly name: string };

function readingOf(payload: UsageReadPayload): UsageReading {
  return {
    account: payload.account,
    source: payload.source,
    readAt: new Date(payload.readAt),
    limits: payload.limits.map((limit) => ({ ...limit, resetsAt: limit.resetsAt === null ? null : new Date(limit.resetsAt) })),
  };
}

function readingsByAccount(records: readonly FactoryEventRecord[]): ReadonlyMap<string, readonly UsageReading[]> {
  const readings = new Map<string, UsageReading[]>();
  for (const record of records) {
    if (record.type !== USAGE_READ_EVENT) continue;
    const parsed = UsageReadPayloadSchema.safeParse(record.payload);
    if (!parsed.success) continue;
    readings.set(parsed.data.account, [...(readings.get(parsed.data.account) ?? []), readingOf(parsed.data)]);
  }
  return readings;
}

function sameLimits(left: readonly UsageLimitReading[], right: readonly UsageLimitReading[]): boolean {
  return (
    left.length === right.length &&
    left.every((limit) =>
      right.some(
        (other) =>
          other.kind === limit.kind &&
          other.scope === limit.scope &&
          other.utilization === limit.utilization &&
          other.resetsAt?.getTime() === limit.resetsAt?.getTime(),
      ),
    )
  );
}

export function streamLimits(snapshots: readonly RateLimitSnapshot[]): readonly UsageLimitReading[] {
  return snapshots.map((snapshot) => ({ kind: STREAM_WINDOW_KINDS[snapshot.window], scope: null, utilization: snapshot.utilization, resetsAt: snapshot.resetsAt }));
}

/**
 * Admits agent runs against the subscription: picks the first account whose windows are all
 * below their thresholds, keeps a resumed session on the account that started it, and stops
 * every run for the rest of the UTC day once the daily cap is spent. It decides on readings
 * that carry their source and their read time, from the usage report or from run streams.
 */
export class BudgetGovernor {
  private readonly events: EventStore;
  private readonly clock: Clock;
  private settings: BudgetGovernorSettings;

  constructor(events: EventStore, clock: Clock, settings: BudgetGovernorSettings) {
    this.events = events;
    this.clock = clock;
    this.settings = settings;
  }

  get thresholds(): UsageThresholds {
    return this.settings.thresholds;
  }

  get dailyCap(): DailyCap {
    return this.settings.dailyCap;
  }

  get perRunCapUsd(): number | null {
    return this.settings.perRunCapUsd;
  }

  get staleAfterMs(): number {
    return this.settings.staleAfterMs;
  }

  accountNames(): readonly string[] {
    return this.settings.accounts.length === 0 ? [DEFAULT_ACCOUNT_NAME] : this.settings.accounts;
  }

  updateLimits(limits: BudgetLimits): void {
    this.settings = { ...this.settings, ...limits };
  }

  runBudgetUsd(requestedUsd: number): number {
    const cap = this.settings.perRunCapUsd;
    return cap === null ? requestedUsd : Math.min(requestedUsd, cap);
  }

  async usage(): Promise<readonly AccountUsage[]> {
    const readings = readingsByAccount(await this.events.read(USAGE_SUBJECT_PREFIX, FIRST_SEQUENCE));
    const now = this.clock.now();
    return this.accountNames().map((account) => ({ account, limits: latestLimits(readings.get(account) ?? [], now, this.settings.staleAfterMs) }));
  }

  async spentToday(): Promise<number> {
    const now = this.clock.now();
    return (await this.events.read(RUN_SUBJECT_PREFIX, FIRST_SEQUENCE))
      .filter((record) => record.type === RUN_FINISHED_EVENT)
      .flatMap((record) => {
        const payload = RunFinishedPayloadSchema.safeParse(record.payload);
        return payload.success && isSameUtcDay(new Date(payload.data.endedAt), now) ? [payload.data.costUsd] : [];
      })
      .reduce((sum, cost) => sum + cost, 0);
  }

  async check(): Promise<AccountChoice> {
    const now = this.clock.now();
    const daily = assessDailySpend(await this.spentToday(), dailyCapAmount(this.settings.dailyCap), now);
    if (!daily.admitted) return { kind: 'exhausted', reason: daily.reason, resumesAt: daily.resumesAt };
    return this.choose(await this.usage(), now);
  }

  async select(resumeSessionId: string | null): Promise<AccountSelection> {
    const now = this.clock.now();
    const daily = assessDailySpend(await this.spentToday(), dailyCapAmount(this.settings.dailyCap), now);
    if (!daily.admitted) throw new BudgetExhaustedError(daily.reason, daily.resumesAt);
    const usage = await this.usage();
    const sticky = resumeSessionId === null ? null : await this.accountOfSession(resumeSessionId);
    const candidates = sticky === null ? usage : usage.filter((account) => account.account === sticky);
    const choice = this.choose(candidates.length === 0 ? usage : candidates, now);
    if (choice.kind === 'exhausted') throw new BudgetExhaustedError(choice.reason, choice.resumesAt);
    return { name: choice.account, account: this.settings.accounts.length === 0 ? null : choice.account };
  }

  /** Records a usage reading; a stream reading identical to the latest known one adds nothing. */
  async record(reading: UsageReading): Promise<void> {
    if (reading.limits.length === 0) return;
    if (reading.source === 'agent-stream') {
      const known = (await this.usage()).find((account) => account.account === reading.account)?.limits ?? [];
      const unchanged = reading.limits.every((limit) => known.some((observed) => sameLimits([observed], [limit])));
      if (unchanged) return;
    }
    await this.events.append(USAGE_READ_EVENT, usageSubject(reading.account), {
      account: reading.account,
      source: reading.source,
      readAt: reading.readAt.toISOString(),
      limits: reading.limits.map((limit) => ({ ...limit, resetsAt: limit.resetsAt?.toISOString() ?? null })),
      identity: reading.identity ?? null,
    });
  }

  /** Records the rate-limit windows an agent run's stream reported for its account. */
  observe(accountName: string, snapshots: readonly RateLimitSnapshot[]): Promise<void> {
    return this.record({ account: accountName, source: 'agent-stream', readAt: this.clock.now(), limits: streamLimits(snapshots) });
  }

  private choose(accounts: readonly AccountUsage[], now: Date): AccountChoice {
    const refusals: { readonly account: string; readonly reason: string; readonly resumesAt: Date }[] = [];
    for (const account of accounts) {
      const admission = assessUsage(account.limits, this.settings.thresholds, now);
      if (admission.admitted) return { kind: 'selected', account: account.account };
      refusals.push({ account: account.account, reason: admission.reason, resumesAt: admission.resumesAt });
    }
    if (refusals.length === 0) return { kind: 'exhausted', reason: REASON_NO_ACCOUNT, resumesAt: now };
    return {
      kind: 'exhausted',
      reason: refusals.map((refusal) => `${refusal.account}: ${refusal.reason}`).join('; '),
      resumesAt: new Date(Math.min(...refusals.map((refusal) => refusal.resumesAt.getTime()))),
    };
  }

  private async accountOfSession(sessionId: string): Promise<string | null> {
    const finished = (await this.events.read(RUN_SUBJECT_PREFIX, FIRST_SEQUENCE)).filter((record) => record.type === RUN_FINISHED_EVENT);
    for (const record of finished.reverse()) {
      const payload = RunFinishedPayloadSchema.safeParse(record.payload);
      if (payload.success && payload.data.sessionId === sessionId) return payload.data.account ?? DEFAULT_ACCOUNT_NAME;
    }
    return null;
  }
}
