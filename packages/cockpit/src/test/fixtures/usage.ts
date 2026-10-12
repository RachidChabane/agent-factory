import type { UsageView } from '../../contract/index.ts';
import { MODEL_OPUS, MODEL_SONNET, ACCOUNT_PERSONAL, ACCOUNT_SHARED } from './people.ts';
import type { FixtureClock } from './time.ts';

const SESSION_PAUSE_AT = 0.9;
const WEEKLY_PAUSE_AT = 0.85;
const SESSION_RESET_HOURS = 2.2;
const WEEK_RESET_HOURS = 70;
const READ_MINUTES_AGO = 6;
const RESET_MINUTES_AGO = 20;
const FAILURE_HOURS_AGO = 3;

export function usageView(clock: FixtureClock): UsageView {
  return {
    accounts: [
      {
        name: ACCOUNT_PERSONAL,
        billing: 'subscription',
        identity: { email: 'alex.morgan@example.com', organization: 'example-org', plan: 'Max' },
        limits: [
          { kind: 'session', scope: null, utilization: 0.42, resetsAt: clock.inHours(SESSION_RESET_HOURS), freshness: 'fresh', pauseAt: SESSION_PAUSE_AT },
          { kind: 'weekly_all', scope: null, utilization: 0.63, resetsAt: clock.inHours(WEEK_RESET_HOURS), freshness: 'fresh', pauseAt: WEEKLY_PAUSE_AT },
          { kind: 'weekly_scoped', scope: MODEL_OPUS, utilization: 0.71, resetsAt: clock.inHours(WEEK_RESET_HOURS), freshness: 'stale', pauseAt: WEEKLY_PAUSE_AT },
          { kind: 'weekly_scoped', scope: MODEL_SONNET, utilization: 0.38, resetsAt: clock.minutesAgo(RESET_MINUTES_AGO), freshness: 'window-reset', pauseAt: WEEKLY_PAUSE_AT },
        ],
        source: 'usage-report',
        readAt: clock.minutesAgo(READ_MINUTES_AGO),
        lastFailure: null,
      },
      {
        name: ACCOUNT_SHARED,
        billing: 'api-key',
        identity: null,
        limits: [],
        source: null,
        readAt: null,
        lastFailure: { at: clock.hoursAgo(FAILURE_HOURS_AGO), reason: 'The usage report is not available for an account billed by API key.' },
      },
    ],
    refreshMinutes: 15,
    staleAfterMinutes: 45,
  };
}
