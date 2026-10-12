import type { UsageSettings, UsageWindow } from '../scenario/scenario.ts';
import type { RateLimitWindow, RateLimitWindows } from '../stream/rate-limit-line.ts';
import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_SECOND } from '../time.ts';

const PERCENT_DIVISOR = 100;

export function resetInstant(now: Date, window: UsageWindow): Date {
  return new Date(now.getTime() + window.resetsInHours * MILLISECONDS_PER_HOUR);
}

export function rateLimitWindowsOf(usage: UsageSettings, now: Date): RateLimitWindows {
  return { fiveHour: rateLimitWindowOf(usage.session, now), sevenDay: rateLimitWindowOf(usage.weeklyAll, now) };
}

function rateLimitWindowOf(window: UsageWindow, now: Date): RateLimitWindow {
  return {
    utilization: window.percent / PERCENT_DIVISOR,
    resetsAt: Math.floor(resetInstant(now, window).getTime() / MILLISECONDS_PER_SECOND),
  };
}
