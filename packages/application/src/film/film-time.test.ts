import { describe, expect, it } from 'vitest';
import { formatArrival, isTimeZone, machineTimeZone } from './film-time.ts';

const MOMENT = new Date('2026-10-12T12:05:00.000Z');

describe('film times', () => {
  it('tells the time of day, the date and the zone', () => {
    expect(formatArrival(MOMENT, 'UTC')).toBe('12:05 on 2026-10-12 (UTC)');
  });

  it('tells the same moment in the zone it is asked for', () => {
    expect(formatArrival(MOMENT, 'Asia/Tokyo')).toBe('21:05 on 2026-10-12 (Asia/Tokyo)');
    expect(formatArrival(new Date('2026-10-12T23:30:00.000Z'), 'Asia/Tokyo')).toBe('08:30 on 2026-10-13 (Asia/Tokyo)');
  });

  it('recognises zone names', () => {
    expect(isTimeZone('Europe/Paris')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
  });

  it('reads the zone of the machine, which is a zone', () => {
    expect(isTimeZone(machineTimeZone())).toBe(true);
  });
});
