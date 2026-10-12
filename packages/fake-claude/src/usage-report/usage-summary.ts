import type { UsageSettings, UsageWindow } from '../scenario/scenario.ts';
import { resetInstant } from './rate-limits.ts';

const TIME_ZONE = 'UTC';
const REPORT_HEADLINE = 'You are currently using your subscription to power your Claude Code usage';
const PARAGRAPH_BREAK = '\n\n';
const LINE_BREAK = '\n';
const MINUTES_PAD = 2;
const HOURS_ON_CLOCK = 12;
const BEFORE_NOON = 'am';
const AFTER_NOON = 'pm';

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: TIME_ZONE });

/** The human summary the CLI prints for /usage: one line per limit, reset times in UTC. */
export function usageSummaryOf(usage: UsageSettings, now: Date): string {
  const lines = [
    summaryLine('Current session', usage.session, now),
    summaryLine('Current week (all models)', usage.weeklyAll, now),
    ...usage.weeklyScoped.map((scoped) => summaryLine(`Current week (${scoped.model})`, scoped, now)),
  ];
  return [REPORT_HEADLINE, lines.join(LINE_BREAK)].join(PARAGRAPH_BREAK);
}

function summaryLine(label: string, window: UsageWindow, now: Date): string {
  return `${label}: ${String(window.percent)}% used · resets ${formatReset(resetInstant(now, window))}`;
}

function formatReset(instant: Date): string {
  return `${MONTH_FORMAT.format(instant)} ${String(instant.getUTCDate())} at ${clockTimeOf(instant)} (${TIME_ZONE})`;
}

function clockTimeOf(instant: Date): string {
  const hours = instant.getUTCHours();
  const minutes = instant.getUTCMinutes();
  const hourOnClock = hours % HOURS_ON_CLOCK === 0 ? HOURS_ON_CLOCK : hours % HOURS_ON_CLOCK;
  const meridiem = hours < HOURS_ON_CLOCK ? BEFORE_NOON : AFTER_NOON;
  const minutesPart = minutes === 0 ? '' : `:${String(minutes).padStart(MINUTES_PAD, '0')}`;
  return `${String(hourOnClock)}${minutesPart}${meridiem}`;
}
