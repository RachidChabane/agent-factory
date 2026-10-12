import { needsRefresh } from '@agent-factory/domain';
import type { InstallationTask } from '../daemon/installation-daemon.ts';
import type { Clock, EventStore, OperationLog, UsageReportSource } from '../ports.ts';
import {
  USAGE_READ_EVENT,
  USAGE_READ_FAILED_EVENT,
  USAGE_SUBJECT_PREFIX,
  usageSubject,
  UsageReadFailedPayloadSchema,
  UsageReadPayloadSchema,
  type UsageReadFailedPayload,
} from './budget-events.ts';
import type { AccountUsage, BudgetGovernor } from './budget-governor.ts';

const FIRST_SEQUENCE = 0;
const REPORT_SOURCE = 'usage-report';

/** Makes sure the usage an agent run is admitted on was read, not guessed. */
export interface UsageFreshener {
  ensureFresh(signal: AbortSignal): Promise<void>;
}

export interface UsageRefresherSettings {
  readonly refreshMs: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Keeps the subscription usage of every account current: reads the usage report of an
 * account when its last report is older than the refresh interval, or when a window it
 * shows has reset or gone stale, and on the operator's demand. A failed read is recorded,
 * so the cockpit says why the figures are old instead of showing them as current.
 */
export class UsageRefresher implements InstallationTask, UsageFreshener {
  readonly name = 'refreshing subscription usage';
  private readonly governor: BudgetGovernor;
  private readonly source: UsageReportSource;
  private readonly events: EventStore;
  private readonly clock: Clock;
  private readonly log: OperationLog;
  private readonly settings: UsageRefresherSettings;

  constructor(governor: BudgetGovernor, source: UsageReportSource, events: EventStore, clock: Clock, log: OperationLog, settings: UsageRefresherSettings) {
    this.governor = governor;
    this.source = source;
    this.events = events;
    this.clock = clock;
    this.log = log;
    this.settings = settings;
  }

  async run(signal: AbortSignal): Promise<void> {
    await this.readAccountsWhere(signal, (account, last, now) => last === null || now - last >= this.settings.refreshMs || this.unreliable(account, last, now));
  }

  /** Before an agent run: reads every account whose usage is unknown, stale or from a reset window, unless a read was just tried. */
  async ensureFresh(signal: AbortSignal): Promise<void> {
    await this.readAccountsWhere(signal, (account, last, now) => this.unreliable(account, last, now));
  }

  /** Reads every account now, whatever the interval, and returns the usage it leads to. */
  async refreshNow(signal: AbortSignal): Promise<readonly AccountUsage[]> {
    for (const account of this.governor.accountNames()) await this.readAccount(account, signal);
    return this.governor.usage();
  }

  private unreliable(account: AccountUsage, last: number | null, now: number): boolean {
    return needsRefresh(account.limits) && (last === null || now - last >= this.settings.refreshMs / 2);
  }

  private async readAccountsWhere(signal: AbortSignal, due: (account: AccountUsage, last: number | null, now: number) => boolean): Promise<void> {
    const attempts = await this.lastAttempts();
    const now = this.clock.now().getTime();
    for (const account of await this.governor.usage()) {
      if (due(account, attempts.get(account.account) ?? null, now)) await this.readAccount(account.account, signal);
    }
  }

  private async readAccount(account: string, signal: AbortSignal): Promise<void> {
    try {
      await this.governor.record(await this.source.read(account, signal));
    } catch (error) {
      if (signal.aborted) return;
      const payload: UsageReadFailedPayload = { account, failedAt: this.clock.now().toISOString(), reason: message(error) };
      await this.events.append(USAGE_READ_FAILED_EVENT, usageSubject(account), payload);
      this.log.warn(`reading the usage of ${account} failed: ${payload.reason}`);
    }
  }

  private async lastAttempts(): Promise<ReadonlyMap<string, number>> {
    const attempts = new Map<string, number>();
    for (const record of await this.events.read(USAGE_SUBJECT_PREFIX, FIRST_SEQUENCE)) {
      if (record.type === USAGE_READ_EVENT) {
        const parsed = UsageReadPayloadSchema.safeParse(record.payload);
        if (parsed.success && parsed.data.source === REPORT_SOURCE) attempts.set(parsed.data.account, new Date(parsed.data.readAt).getTime());
      } else if (record.type === USAGE_READ_FAILED_EVENT) {
        const parsed = UsageReadFailedPayloadSchema.safeParse(record.payload);
        if (parsed.success) attempts.set(parsed.data.account, new Date(parsed.data.failedAt).getTime());
      }
    }
    return attempts;
  }
}
