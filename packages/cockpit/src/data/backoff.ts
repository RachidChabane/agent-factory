export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 30_000;
export const BACKOFF_FACTOR = 2;
export const BACKOFF_JITTER_SHARE = 0.5;
export const OFFLINE_AFTER_ATTEMPTS = 5;

export function reconnectDelay(attempt: number, random: () => number): number {
  const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** Math.max(0, attempt));
  const fixedShare = exponential * (1 - BACKOFF_JITTER_SHARE);
  return Math.round(fixedShare + exponential * BACKOFF_JITTER_SHARE * random());
}
