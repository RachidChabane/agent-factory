import { describe, expect, it } from 'vitest';
import { createFormatters, HOUR_MS, MINUTE_MS } from './formatters.ts';

const NOW = Date.parse('2026-10-12T10:00:00.000Z');
const LABELS = { justNow: 'just now' };
const english = createFormatters('en', LABELS, 'UTC');
const french = createFormatters('fr', { justNow: 'à l’instant' }, 'UTC');
const ago = (minutes: number) => new Date(NOW - minutes * MINUTE_MS).toISOString();

describe('formatters', () => {
  it('writes dollars with the currency conventions of the language', () => {
    expect(english.usd(1234.5)).toBe('$1,234.50');
    expect(french.usd(1234.5).replace(/\s/g, ' ')).toBe('1 234,50 $US');
  });

  it('keeps sub-cent amounts visible instead of rounding them to zero', () => {
    expect(english.usd(0.0042)).toBe('$0.0042');
    expect(english.usd(0)).toBe('$0.00');
  });

  it('writes percentages of a ratio and of a value from 0 to 100', () => {
    expect(english.percent(0.42)).toBe('42%');
    expect(english.percentPoints(63)).toBe('63%');
    expect(french.percent(0.42).replace(/\s/g, ' ')).toBe('42 %');
  });

  it('says "just now" under 45 seconds and counts minutes, hours and days after that', () => {
    expect(english.ago(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now');
    expect(english.ago(ago(3), NOW)).toMatch(/^3 min/);
    expect(english.ago(ago(3), NOW)).toMatch(/ago$/);
    expect(english.ago(new Date(NOW - 5 * HOUR_MS).toISOString(), NOW)).toMatch(/^5 hr/);
    expect(french.ago(ago(3), NOW).replace(/\s/g, ' ')).toMatch(/^il y a 3 min/);
  });

  it('gives a short date for an old instant', () => {
    expect(english.ago('2026-08-01T10:00:00.000Z', NOW)).toBe('Aug 1');
  });

  it('counts the time until an instant', () => {
    expect(english.until(new Date(NOW + 5 * MINUTE_MS).toISOString(), NOW)).toMatch(/^in 5 min/);
    expect(french.until(new Date(NOW + 5 * MINUTE_MS).toISOString(), NOW).replace(/\s/g, ' ')).toMatch(/^dans 5 min/);
  });

  it('writes durations with the units of the language', () => {
    expect(english.duration(125_000)).toBe('2 min 5 sec');
    expect(english.duration(3_900_000)).toBe('1 hr 5 min');
    expect(english.duration(15 * MINUTE_MS)).toBe('15 min');
    expect(english.duration(2 * HOUR_MS)).toBe('2 hr');
    expect(english.duration(0)).toBe('0 sec');
    expect(french.duration(125_000).replace(/\s/g, ' ')).toBe('2 min 5 s');
  });

  it('writes the exact moment, in the zone it was given, for tooltips', () => {
    expect(english.absolute('2026-10-12T09:30:14.000Z')).toBe('October 12, 2026 at 9:30:14 AM UTC');
  });

  it('writes an instant in the zone it is told in, with the zone named, whatever zone the formatters were made for', () => {
    const instant = '2026-10-12T21:11:00.000Z';
    expect(english.dateTimeIn(instant, 'Europe/Paris').replace(/\s/g, ' ')).toBe('Oct 12, 2026, 11:11 PM (Europe/Paris)');
    expect(english.dateTimeIn(instant, 'Asia/Tokyo').replace(/\s/g, ' ')).toBe('Oct 13, 2026, 6:11 AM (Asia/Tokyo)');
    expect(english.dateTimeIn(instant, 'UTC').replace(/\s/g, ' ')).toBe('Oct 12, 2026, 9:11 PM (UTC)');
    expect(french.dateTimeIn(instant, 'Europe/Paris').replace(/\s/g, ' ')).toBe('12 oct. 2026, 23:11 (Europe/Paris)');
  });

  it('writes a calendar day without shifting it by a time zone', () => {
    const west = createFormatters('en', LABELS, 'America/Los_Angeles');
    expect(west.calendarDay('2026-10-12')).toBe('Oct 12');
  });

  it('writes sizes in bytes, kilobytes and megabytes', () => {
    expect(english.bytes(512)).toMatch(/512/);
    expect(english.bytes(2048)).toMatch(/^2(\.\d)? ?kB$/);
    expect(english.bytes(5_000_000)).toMatch(/^5(\.\d)? ?MB$/);
  });

  it('joins a list with the conjunction of the language', () => {
    expect(english.list(['a', 'b', 'c'])).toBe('a, b, and c');
    expect(french.list(['a', 'b', 'c'])).toBe('a, b et c');
  });

  it('cuts a list into its items and the words between them, so that items can be written with markup', () => {
    expect(english.listParts(['server', 'gate'])).toEqual([
      { kind: 'item', text: 'server' },
      { kind: 'separator', text: ' and ' },
      { kind: 'item', text: 'gate' },
    ]);
    expect(french.listParts(['a', 'b', 'c']).filter((part) => part.kind === 'separator').map((part) => part.text)).toEqual([', ', ' et ']);
    expect(english.listParts([])).toEqual([]);
  });
});
