import type { Locale } from './locale.ts';
import { LOCALE_TAGS } from './locale.ts';

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

const JUST_NOW_MS = 45 * SECOND_MS;
const WEEKS_BEFORE_DATE = 5;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SMALL_AMOUNT_USD = 0.01;
const BYTES_PER_UNIT = 1000;
const CURRENCY = 'USD';
const UTC = 'UTC';

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

export function toEpoch(iso: string): number {
  return Date.parse(iso);
}

export interface FormatterLabels {
  readonly justNow: string;
}

/** One piece of a written list: an item of the list, or the words and punctuation between items. */
export interface ListPart {
  readonly kind: 'item' | 'separator';
  readonly text: string;
}

export interface Formatters {
  readonly locale: Locale;
  integer(value: number): string;
  decimal(value: number, fractionDigits?: number): string;
  compact(value: number): string;
  /** A ratio where 1 is one hundred percent. */
  percent(ratio: number): string;
  /** A value already expressed from 0 to 100. */
  percentPoints(value: number): string;
  /** An amount of dollars; sub-cent amounts keep four decimals so they never read as zero. */
  usd(amount: number): string;
  bytes(size: number): string;
  list(items: readonly string[]): string;
  /** The same list cut into its items and its separators, for lists whose items are written with markup. */
  listParts(items: readonly string[]): readonly ListPart[];
  date(iso: string): string;
  shortDate(iso: string): string;
  /** A calendar day written as `YYYY-MM-DD`, shown without any time zone shift. */
  calendarDay(day: string): string;
  dateTime(iso: string): string;
  time(iso: string): string;
  weekdayTime(iso: string): string;
  /** The full date and time with seconds and zone, for tooltips and `title` attributes. */
  absolute(iso: string): string;
  /** How long ago an instant was: "just now", "3 min. ago", a short date when it is old. */
  ago(iso: string, now: number): string;
  /** How long until an instant: "in 3 min.", a weekday and time when it is far. */
  until(iso: string, now: number): string;
  duration(milliseconds: number): string;
  elapsedSince(iso: string, now: number): string;
}

function unitFormat(tag: string, unit: string): Intl.NumberFormat {
  return new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 0 });
}

export function createFormatters(locale: Locale, labels: FormatterLabels, timeZone?: string): Formatters {
  const tag = LOCALE_TAGS[locale];
  const zone = timeZone === undefined ? {} : { timeZone };
  const integerFormat = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const compactFormat = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
  const percentFormat = new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 });
  const usdFormat = new Intl.NumberFormat(tag, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const smallUsdFormat = new Intl.NumberFormat(tag, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const byteFormats = BYTE_UNITS.map((unit) => new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }));
  const listFormat = new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' });
  const dateFormat = new Intl.DateTimeFormat(tag, { ...zone, dateStyle: 'medium' });
  const shortDateFormat = new Intl.DateTimeFormat(tag, { ...zone, day: 'numeric', month: 'short' });
  const calendarDayFormat = new Intl.DateTimeFormat(tag, { timeZone: UTC, day: 'numeric', month: 'short' });
  const dateTimeFormat = new Intl.DateTimeFormat(tag, { ...zone, dateStyle: 'medium', timeStyle: 'short' });
  const timeFormat = new Intl.DateTimeFormat(tag, { ...zone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const weekdayTimeFormat = new Intl.DateTimeFormat(tag, { ...zone, weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const absoluteFormat = new Intl.DateTimeFormat(tag, { ...zone, dateStyle: 'long', timeStyle: 'long' });
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'always', style: 'short' });
  const hours = unitFormat(tag, 'hour');
  const minutes = unitFormat(tag, 'minute');
  const seconds = unitFormat(tag, 'second');

  const duration = (milliseconds: number): string => {
    const total = Math.max(0, Math.round(milliseconds / SECOND_MS));
    const hourPart = Math.floor(total / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
    const minutePart = Math.floor((total % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) / SECONDS_PER_MINUTE);
    const secondPart = total % SECONDS_PER_MINUTE;
    if (hourPart > 0) return [hours.format(hourPart), minutePart > 0 ? minutes.format(minutePart) : null].filter((part) => part !== null).join(' ');
    if (minutePart > 0) return [minutes.format(minutePart), secondPart > 0 ? seconds.format(secondPart) : null].filter((part) => part !== null).join(' ');
    return seconds.format(secondPart);
  };

  return {
    locale,
    integer: (value) => integerFormat.format(value),
    decimal: (value, fractionDigits = 1) =>
      new Intl.NumberFormat(tag, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value),
    compact: (value) => compactFormat.format(value),
    percent: (ratio) => percentFormat.format(ratio),
    percentPoints: (value) => percentFormat.format(value / 100),
    usd: (amount) => (amount > 0 && amount < SMALL_AMOUNT_USD ? smallUsdFormat : usdFormat).format(amount),
    bytes: (size) => {
      const exponent = Math.min(BYTE_UNITS.length - 1, size <= 0 ? 0 : Math.floor(Math.log(size) / Math.log(BYTES_PER_UNIT)));
      const format = byteFormats[exponent] ?? byteFormats[0];
      return (format ?? integerFormat).format(size / BYTES_PER_UNIT ** exponent);
    },
    list: (items) => listFormat.format(items),
    listParts: (items) => listFormat.formatToParts(items).map((part): ListPart => ({ kind: part.type === 'element' ? 'item' : 'separator', text: part.value })),
    date: (iso) => dateFormat.format(toEpoch(iso)),
    shortDate: (iso) => shortDateFormat.format(toEpoch(iso)),
    calendarDay: (day) => calendarDayFormat.format(Date.parse(`${day}T00:00:00Z`)),
    dateTime: (iso) => dateTimeFormat.format(toEpoch(iso)),
    time: (iso) => timeFormat.format(toEpoch(iso)),
    weekdayTime: (iso) => weekdayTimeFormat.format(toEpoch(iso)),
    absolute: (iso) => absoluteFormat.format(toEpoch(iso)),
    ago: (iso, now) => {
      const elapsed = Math.max(0, now - toEpoch(iso));
      if (elapsed < JUST_NOW_MS) return labels.justNow;
      if (elapsed < HOUR_MS) return relative.format(-Math.max(1, Math.round(elapsed / MINUTE_MS)), 'minute');
      if (elapsed < DAY_MS) return relative.format(-Math.floor(elapsed / HOUR_MS), 'hour');
      if (elapsed < WEEK_MS) return relative.format(-Math.floor(elapsed / DAY_MS), 'day');
      if (elapsed < WEEKS_BEFORE_DATE * WEEK_MS) return relative.format(-Math.floor(elapsed / WEEK_MS), 'week');
      return shortDateFormat.format(toEpoch(iso));
    },
    until: (iso, now) => {
      const remaining = Math.max(0, toEpoch(iso) - now);
      if (remaining < HOUR_MS) return relative.format(Math.max(1, Math.ceil(remaining / MINUTE_MS)), 'minute');
      if (remaining < DAY_MS) return relative.format(Math.floor(remaining / HOUR_MS), 'hour');
      if (remaining < WEEK_MS) return weekdayTimeFormat.format(toEpoch(iso));
      return dateTimeFormat.format(toEpoch(iso));
    },
    duration,
    elapsedSince: (iso, now) => duration(Math.max(0, now - toEpoch(iso))),
  };
}
