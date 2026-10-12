const DATE_LOCALE = 'en-CA';
const CLOCK_LOCALE = 'en-GB';
const TWO_DIGITS = '2-digit';
const NUMERIC = 'numeric';

/** The zone of the machine the factory runs on. */
export function machineTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat(DATE_LOCALE, { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function part(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((candidate) => candidate.type === type)?.value ?? '';
}

/** `14:05 on 2026-10-12 (Europe/Paris)`: a time of day, its date and the zone that gives both. */
export function formatArrival(at: Date, timeZone: string): string {
  const clock = new Intl.DateTimeFormat(CLOCK_LOCALE, { timeZone, hour: TWO_DIGITS, minute: TWO_DIGITS, hourCycle: 'h23' }).formatToParts(at);
  const calendar = new Intl.DateTimeFormat(DATE_LOCALE, { timeZone, year: NUMERIC, month: TWO_DIGITS, day: TWO_DIGITS }).formatToParts(at);
  return `${part(clock, 'hour')}:${part(clock, 'minute')} on ${part(calendar, 'year')}-${part(calendar, 'month')}-${part(calendar, 'day')} (${timeZone})`;
}
