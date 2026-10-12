import { stampFields, type Stamp, type StreamLine } from './stream-line.ts';
import { LINE_TYPES } from './stream-vocabulary.ts';

const STATUS_ALLOWED = 'allowed';
const FIVE_HOUR_WINDOW = 'five_hour';
const OVERAGE_STATUS = 'rejected';
const OVERAGE_DISABLED_REASON = 'org_level_disabled';

export interface RateLimitWindow {
  readonly utilization: number;
  readonly resetsAt: number;
}

export interface RateLimitWindows {
  readonly fiveHour: RateLimitWindow;
  readonly sevenDay: RateLimitWindow;
}

export function rateLimitLine(stamp: Stamp, windows: RateLimitWindows): StreamLine {
  return {
    type: LINE_TYPES.rateLimit,
    rate_limit_info: {
      status: STATUS_ALLOWED,
      resetsAt: windows.fiveHour.resetsAt,
      rateLimitType: FIVE_HOUR_WINDOW,
      overageStatus: OVERAGE_STATUS,
      overageDisabledReason: OVERAGE_DISABLED_REASON,
      isUsingOverage: false,
      unifiedWindows: {
        five_hour: windows.fiveHour,
        seven_day: windows.sevenDay,
      },
    },
    ...stampFields(stamp),
  };
}
