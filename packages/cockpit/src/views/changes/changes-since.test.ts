import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../i18n/formatters.ts';
import {
  CUSTOM_SINCE,
  defaultSince,
  fromLocalInputValue,
  matchingPreset,
  parseInstant,
  persistSeenAt,
  presetSince,
  readSeenAt,
  SEEN_STORAGE_KEY,
  SINCE_PRESETS,
  toLocalInputValue,
} from './changes-since.ts';

const NOW = Date.parse('2026-10-12T10:00:00.000Z');

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function asStorage(storage: MemoryStorage): Storage {
  return storage as unknown as Storage;
}

describe('the moment the changes are counted from', () => {
  it('reads an instant, and nothing from an empty or unreadable text', () => {
    expect(parseInstant('2026-10-11T08:30:00.000Z')).toBe(Date.parse('2026-10-11T08:30:00.000Z'));
    expect(parseInstant('')).toBeNull();
    expect(parseInstant(null)).toBeNull();
    expect(parseInstant('yesterday')).toBeNull();
  });

  it('starts at the last time the changes were seen, or a day ago when they never were', () => {
    expect(defaultSince(NOW - 5 * HOUR_MS, NOW)).toBe(NOW - 5 * HOUR_MS);
    expect(defaultSince(null, NOW)).toBe(NOW - DAY_MS);
  });

  it('keeps the moment seen in the browser and reads it back', () => {
    const storage = new MemoryStorage();
    expect(readSeenAt(asStorage(storage))).toBeNull();
    expect(persistSeenAt(asStorage(storage), NOW)).toBe(true);
    expect(storage.values.get(SEEN_STORAGE_KEY)).toBe('2026-10-12T10:00:00.000Z');
    expect(readSeenAt(asStorage(storage))).toBe(NOW);
  });

  it('says that the moment was not kept when the browser has no storage or refuses it', () => {
    const refusing = { getItem: () => null, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(persistSeenAt(null, NOW)).toBe(false);
    expect(persistSeenAt(refusing, NOW)).toBe(false);
    expect(readSeenAt(null)).toBeNull();
    expect(readSeenAt({ getItem: () => { throw new Error('blocked'); } } as unknown as Storage)).toBeNull();
  });

  it.each(SINCE_PRESETS)('recognises the preset %s from the instant it gives', (preset) => {
    expect(matchingPreset(presetSince(preset, NOW), NOW)).toBe(preset);
    expect(matchingPreset(presetSince(preset, NOW) + 30 * 1000, NOW)).toBe(preset);
  });

  it('calls any other instant custom', () => {
    expect(matchingPreset(NOW - 5 * HOUR_MS, NOW)).toBe(CUSTOM_SINCE);
    expect(matchingPreset(presetSince('24h', NOW) - 2 * MINUTE_MS, NOW)).toBe(CUSTOM_SINCE);
  });

  it('writes an instant for a local date field and reads it back to the minute, whatever the instant', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.parse('2020-01-01T00:00:00Z'), max: Date.parse('2035-01-01T00:00:00Z') }), (epoch) => {
        const minute = Math.floor(epoch / MINUTE_MS) * MINUTE_MS;
        const read = fromLocalInputValue(toLocalInputValue(minute));
        expect(read).not.toBeNull();
        expect(Math.abs((read ?? 0) - minute)).toBeLessThanOrEqual(HOUR_MS);
      }),
    );
    expect(fromLocalInputValue('')).toBeNull();
  });
});
