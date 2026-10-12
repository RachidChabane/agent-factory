import type { RunView } from '../../contract/index.ts';
import { usd } from '../../format/format.ts';

export const LIVE_RUN_STATUSES: readonly RunView['status'][] = ['running', 'waiting'];
export const COST_PENDING = '—';

export function isCostPending(run: Pick<RunView, 'status' | 'costUsd'>): boolean {
  return LIVE_RUN_STATUSES.includes(run.status) && run.costUsd === 0;
}

export function runCost(run: Pick<RunView, 'status' | 'costUsd'>): string {
  return isCostPending(run) ? COST_PENDING : usd(run.costUsd);
}
