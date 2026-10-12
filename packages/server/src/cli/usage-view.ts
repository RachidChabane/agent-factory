import type { UsageLimitView, UsageView } from '@agent-factory/cockpit';
import { PERCENT_SCALE, type UsageSource } from '@agent-factory/domain';
import { COMMAND_NAMES, PROGRAM_NAME, REFRESH_FLAG } from './command-line.ts';
import { readingTime } from './time-text.ts';

const FRESH = 'fresh';
const SOURCE_NAMES: Readonly<Record<UsageSource, string>> = {
  'usage-report': 'Claude usage report',
  'agent-stream': 'rate-limit events of an agent run',
};

function percent(ratio: number): string {
  return `${Math.round(ratio * PERCENT_SCALE)}%`;
}

function limitName(limit: UsageLimitView): string {
  return limit.scope === null ? limit.kind : `${limit.kind} (${limit.scope})`;
}

function limitLine(limit: UsageLimitView): string {
  const resets = limit.resetsAt === null ? 'reset time not reported' : `resets ${limit.resetsAt}`;
  const freshness = limit.freshness === FRESH ? '' : `, ${limit.freshness}`;
  return `  ${limitName(limit)}: ${percent(limit.utilization)} used, pauses at ${percent(limit.pauseAt)}, ${resets}${freshness}`;
}

/** Each account's limits, by kind, with when they were read; never a figure without its reading time. */
export function renderUsage(usage: UsageView, now: Date): readonly string[] {
  const lines: string[] = [];
  for (const account of usage.accounts) {
    const read = account.readAt === null ? `never read; run "${PROGRAM_NAME} ${COMMAND_NAMES.usage} ${REFRESH_FLAG}"` : `read ${readingTime(account.readAt, now)}${account.source === null ? '' : ` from the ${SOURCE_NAMES[account.source]}`}`;
    lines.push(`Account ${account.name} (${account.billing}): ${read}`);
    for (const limit of account.limits) lines.push(limitLine(limit));
    if (account.lastFailure !== null) lines.push(`  last read failed ${readingTime(account.lastFailure.at, now)}: ${account.lastFailure.reason}`);
  }
  lines.push(`Usage is read every ${usage.refreshMinutes} min; a reading older than ${usage.staleAfterMinutes} min counts as stale.`);
  return lines;
}
