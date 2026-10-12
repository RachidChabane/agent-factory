export const LOCALE = 'fr-FR';

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

const JUST_NOW_MS = 45 * SECOND_MS;
const SHORT_SHA_LENGTH = 7;
const WEEKS_BEFORE_DATE = 5;

const decimalFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const oneDecimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const weekdayTimeFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function toEpoch(iso: string): number {
  return Date.parse(iso);
}

export function relativeTime(iso: string, now: number): string {
  const elapsed = Math.max(0, now - toEpoch(iso));
  if (elapsed < JUST_NOW_MS) return 'à l’instant';
  if (elapsed < HOUR_MS) return `${Math.max(1, Math.round(elapsed / MINUTE_MS))} min`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} h`;
  if (elapsed < WEEK_MS) return `${Math.floor(elapsed / DAY_MS)} j`;
  if (elapsed < WEEKS_BEFORE_DATE * WEEK_MS) return `${Math.floor(elapsed / WEEK_MS)} sem`;
  return shortDateFormat.format(toEpoch(iso));
}

export function duration(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / SECOND_MS));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`;
  if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
  return `${seconds} s`;
}

export function untilTime(iso: string, now: number): string {
  const remaining = Math.max(0, toEpoch(iso) - now);
  if (remaining < HOUR_MS) return `dans ${Math.max(1, Math.round(remaining / MINUTE_MS))} min`;
  if (remaining < DAY_MS) {
    const hours = Math.floor(remaining / HOUR_MS);
    const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
    return `dans ${hours} h ${String(minutes).padStart(2, '0')}`;
  }
  return `${weekdayTimeFormat.format(toEpoch(iso))}`;
}

export function usd(amount: number): string {
  return `${decimalFormat.format(amount)} $`;
}

export function integer(value: number): string {
  return integerFormat.format(value);
}

export function compact(value: number): string {
  return compactFormat.format(value);
}

export function oneDecimal(value: number): string {
  return oneDecimalFormat.format(value);
}

export function percent(ratio: number): string {
  return `${integerFormat.format(ratio * 100)} %`;
}

export function percentValue(value: number): string {
  return `${integerFormat.format(value)} %`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

const FULL_SHA = /^[0-9a-f]{40}$/;

export function commitReference(value: string): string {
  return FULL_SHA.test(value) ? shortSha(value) : value;
}

export function dateTime(iso: string): string {
  return dateTimeFormat.format(toEpoch(iso));
}

export function shortDate(iso: string): string {
  return shortDateFormat.format(toEpoch(iso));
}

export function clockTime(iso: string): string {
  return timeFormat.format(toEpoch(iso));
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${integer(count)} ${count > 1 ? pluralForm : singular}`;
}
