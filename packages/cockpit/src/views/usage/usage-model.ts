import type { UsageAccountView, UsageLimitView } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';

export type LimitReset =
  | { readonly kind: 'upcoming'; readonly at: string }
  | { readonly kind: 'elapsed'; readonly at: string }
  | { readonly kind: 'unknown' };

/** When a window resets: still to come, already past, or not reported. */
export function resetOf(limit: Pick<UsageLimitView, 'resetsAt'>, now: number): LimitReset {
  if (limit.resetsAt === null) return { kind: 'unknown' };
  return toEpoch(limit.resetsAt) > now ? { kind: 'upcoming', at: limit.resetsAt } : { kind: 'elapsed', at: limit.resetsAt };
}

export function limitKey(limit: Pick<UsageLimitView, 'kind' | 'scope'>): string {
  return `${limit.kind}:${limit.scope ?? ''}`;
}

export type NoLimitsReason = 'api-key' | 'never-read' | 'none-reported';

/** Why an account lists no limit: it has none to read, it was never read, or its last reading found none. */
export function noLimitsReason(account: Pick<UsageAccountView, 'billing' | 'source' | 'readAt'>): NoLimitsReason {
  if (account.billing === 'api-key') return 'api-key';
  return account.source === null || account.readAt === null ? 'never-read' : 'none-reported';
}
