import type { LimitTone } from '../../model/usage.ts';
import { limitTone } from '../../model/usage.ts';

const FULL_RATIO = 1;

export interface Consumption {
  /** The share of the limit that is used; above 1 once the limit is exceeded. */
  readonly ratio: number;
  readonly tone: LimitTone;
}

function ratioOf(used: number, limit: number): number {
  if (limit > 0) return used / limit;
  return used > 0 ? FULL_RATIO : 0;
}

/** How much of a limit (a budget, a cap, a turn count) is used, with the tone a meter shows it in: a limit of zero is used up by anything spent. */
export function consumptionOf(used: number, limit: number): Consumption {
  const ratio = ratioOf(used, limit);
  return { ratio, tone: limitTone({ utilization: ratio, pauseAt: FULL_RATIO }) };
}
