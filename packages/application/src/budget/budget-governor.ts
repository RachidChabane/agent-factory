import { assessDailySpend, chooseAccount, isSameUtcDay, RATE_LIMIT_WINDOWS } from '@agent-factory/domain';
import type { AccountChoice, AccountStanding, BudgetThresholds, RateLimitSnapshot } from '@agent-factory/domain';
import type { Clock, EventStore, FactoryEventRecord } from '../ports.ts';
import { RUN_FINISHED_EVENT, RUN_SUBJECT_PREFIX, RunFinishedPayloadSchema } from '../runs/run-events.ts';
import { BUDGET_SUBJECT_PREFIX, budgetSubject, RATE_LIMIT_OBSERVED_EVENT, RateLimitObservedPayloadSchema } from './budget-events.ts';

export const DEFAULT_ACCOUNT_NAME = 'default';
const FIRST_SEQUENCE = 0;

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
  readonly thresholds: BudgetThresholds;
  readonly dailyCapUsd: number | null;
  readonly perRunCapUsd: number | null;
}

export interface BudgetGovernorSettings extends BudgetLimits {
  readonly accounts: readonly string[];
}

export type AccountSelection = { readonly account: string | null; readonly name: string };

function snapshotsOf(records: readonly FactoryEventRecord[]): ReadonlyMap<string, readonly RateLimitSnapshot[]> {
  const latest = new Map<string, Map<RateLimitSnapshot['window'], RateLimitSnapshot>>();
  for (const record of records) {
    if (record.type !== RATE_LIMIT_OBSERVED_EVENT) continue;
    const payload = RateLimitObservedPayloadSchema.parse(record.payload);
    const windows = latest.get(payload.account) ?? new Map<RateLimitSnapshot['window'], RateLimitSnapshot>();
    for (const snapshot of payload.snapshots) {
      windows.set(snapshot.window, { window: snapshot.window, utilization: snapshot.utilization, resetsAt: new Date(snapshot.resetsAt) });
    }
    latest.set(payload.account, windows);
  }
  return new Map([...latest].map(([account, windows]) => [account, RATE_LIMIT_WINDOWS.flatMap((window) => windows.get(window) ?? [])]));
}

function sameSnapshots(left: readonly RateLimitSnapshot[], right: readonly RateLimitSnapshot[]): boolean {
  return (
    left.length === right.length &&
    left.every((snapshot) =>
      right.some(
        (other) =>
          other.window === snapshot.window &&
          other.utilization === snapshot.utilization &&
          other.resetsAt.getTime() === snapshot.resetsAt.getTime(),
      ),
    )
  );
}

export class BudgetGovernor {
  private readonly events: EventStore;
  private readonly clock: Clock;
  private settings: BudgetGovernorSettings;

  constructor(events: EventStore, clock: Clock, settings: BudgetGovernorSettings) {
    this.events = events;
    this.clock = clock;
    this.settings = settings;
  }

  get thresholds(): BudgetThresholds {
    return this.settings.thresholds;
  }

  accountNames(): readonly string[] {
    return this.settings.accounts.length === 0 ? [DEFAULT_ACCOUNT_NAME] : this.settings.accounts;
  }

  async standings(): Promise<readonly AccountStanding[]> {
    const snapshots = snapshotsOf(await this.events.read(BUDGET_SUBJECT_PREFIX, FIRST_SEQUENCE));
    return this.accountNames().map((account) => ({ account, snapshots: snapshots.get(account) ?? [] }));
  }

  get dailyCapUsd(): number | null {
    return this.settings.dailyCapUsd;
  }

  get perRunCapUsd(): number | null {
    return this.settings.perRunCapUsd;
  }

  updateLimits(limits: BudgetLimits): void {
    this.settings = { ...this.settings, ...limits };
  }

  runBudgetUsd(requestedUsd: number): number {
    const cap = this.settings.perRunCapUsd;
    return cap === null ? requestedUsd : Math.min(requestedUsd, cap);
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
    const daily = assessDailySpend(await this.spentToday(), this.settings.dailyCapUsd, now);
    if (!daily.admitted) return { kind: 'exhausted', reason: daily.reason, resumesAt: daily.resumesAt };
    return chooseAccount(await this.standings(), this.settings.thresholds, now);
  }

  async select(resumeSessionId: string | null): Promise<AccountSelection> {
    const daily = assessDailySpend(await this.spentToday(), this.settings.dailyCapUsd, this.clock.now());
    if (!daily.admitted) throw new BudgetExhaustedError(daily.reason, daily.resumesAt);
    const standings = await this.standings();
    const sticky = resumeSessionId === null ? null : await this.accountOfSession(resumeSessionId);
    const candidates = sticky === null ? standings : standings.filter((standing) => standing.account === sticky);
    const choice = chooseAccount(candidates.length === 0 ? standings : candidates, this.settings.thresholds, this.clock.now());
    if (choice.kind === 'exhausted') throw new BudgetExhaustedError(choice.reason, choice.resumesAt);
    return { name: choice.account, account: this.settings.accounts.length === 0 ? null : choice.account };
  }

  async observe(accountName: string, snapshots: readonly RateLimitSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    const known = (await this.standings()).find((standing) => standing.account === accountName)?.snapshots ?? [];
    const merged = RATE_LIMIT_WINDOWS.flatMap(
      (window) => snapshots.find((snapshot) => snapshot.window === window) ?? known.find((snapshot) => snapshot.window === window) ?? [],
    );
    if (sameSnapshots(merged, known)) return;
    await this.events.append(RATE_LIMIT_OBSERVED_EVENT, budgetSubject(accountName), {
      account: accountName,
      snapshots: snapshots.map((snapshot) => ({
        window: snapshot.window,
        utilization: snapshot.utilization,
        resetsAt: snapshot.resetsAt.toISOString(),
      })),
    });
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
