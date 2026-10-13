import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RecentlyUsedCache } from './recently-used-cache.ts';

describe('RecentlyUsedCache', () => {
  it('keeps what it was given, up to its capacity', () => {
    const cache = new RecentlyUsedCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect([cache.get('a'), cache.get('b'), cache.get('c'), cache.get('d')]).toEqual([1, 2, 3, undefined]);
    expect(cache.size).toBe(3);
  });

  it('lets go of the entry used least recently when a new one passes the capacity', () => {
    const cache = new RecentlyUsedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual([1, undefined, 3]);
  });

  it('counts setting an entry again as using it, and replaces its value', () => {
    const cache = new RecentlyUsedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);
    expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual([10, undefined, 3]);
    expect(cache.size).toBe(2);
  });

  it('keeps an empty value, which is not the absence of one', () => {
    const cache = new RecentlyUsedCache<string, readonly string[]>(1);
    cache.set('range', []);
    expect(cache.get('range')).toEqual([]);
  });

  it('refuses a capacity that holds nothing', () => {
    for (const capacity of [0, -1, 1.5, Number.NaN]) expect(() => new RecentlyUsedCache(capacity), String(capacity)).toThrow(RangeError);
  });

  it('answers as a list ordered by use would, and never holds more than its capacity', () => {
    const operation = fc.oneof(
      fc.record({ kind: fc.constant('get' as const), key: fc.integer({ min: 0, max: 6 }) }),
      fc.record({ kind: fc.constant('set' as const), key: fc.integer({ min: 0, max: 6 }), value: fc.integer() }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.array(operation, { maxLength: 60 }), (capacity, operations) => {
        const cache = new RecentlyUsedCache<number, number>(capacity);
        const model: [number, number][] = [];
        for (const step of operations) {
          const position = model.findIndex(([key]) => key === step.key);
          if (step.kind === 'get') {
            const expected = position === -1 ? undefined : model[position]?.[1];
            if (position !== -1) model.push(...model.splice(position, 1));
            if (cache.get(step.key) !== expected) return false;
          } else {
            if (position !== -1) model.splice(position, 1);
            model.push([step.key, step.value]);
            if (model.length > capacity) model.shift();
            cache.set(step.key, step.value);
          }
          if (cache.size !== model.length || cache.size > capacity) return false;
        }
        return model.every(([key, value]) => cache.get(key) === value);
      }),
    );
  });
});
