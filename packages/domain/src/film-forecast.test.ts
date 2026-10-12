import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FILM_HISTORY_SIZE, forecastFilmArrivals, typicalFilmDurationMs, type FilmSlot } from './film-forecast.ts';

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

describe('typical film duration', () => {
  it('falls back when there is no history', () => {
    expect(typicalFilmDurationMs([], 20 * MINUTE)).toBe(20 * MINUTE);
  });

  it('takes the median of an odd history', () => {
    expect(typicalFilmDurationMs([30 * MINUTE, 10 * MINUTE, 22 * MINUTE], 99)).toBe(22 * MINUTE);
  });

  it('averages the two middle durations of an even history', () => {
    expect(typicalFilmDurationMs([10 * MINUTE, 20 * MINUTE, 30 * MINUTE, 50 * MINUTE], 99)).toBe(25 * MINUTE);
  });

  it('looks only at the most recent films', () => {
    const old = Array.from({ length: 10 }, () => 90 * MINUTE);
    const recent = Array.from({ length: FILM_HISTORY_SIZE }, () => 25 * MINUTE);
    expect(typicalFilmDurationMs([...old, ...recent], 99)).toBe(25 * MINUTE);
  });

  it('never leaves the range of the durations it summarises', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 10_000_000 }), { minLength: 1, maxLength: 20 }), (durations) => {
        const recent = durations.slice(-FILM_HISTORY_SIZE);
        const typical = typicalFilmDurationMs(durations, 1);
        return typical >= Math.min(...recent) && typical <= Math.max(...recent);
      }),
    );
  });
});

describe('film arrival forecast', () => {
  const queued = (key: string): FilmSlot => ({ key, startedAtMs: null });

  it('forecasts one typical duration for a film alone in the queue', () => {
    expect(forecastFilmArrivals([queued('a')], 20 * MINUTE, NOW).get('a')).toEqual({ arrivalAtMs: NOW + 20 * MINUTE, filmsAhead: 0 });
  });

  it('adds one typical duration per film queued before', () => {
    const forecast = forecastFilmArrivals([queued('a'), queued('b'), queued('c')], 20 * MINUTE, NOW);
    expect(forecast.get('b')).toEqual({ arrivalAtMs: NOW + 40 * MINUTE, filmsAhead: 1 });
    expect(forecast.get('c')).toEqual({ arrivalAtMs: NOW + 60 * MINUTE, filmsAhead: 2 });
  });

  it('counts the running film from its start and puts it first', () => {
    const forecast = forecastFilmArrivals([queued('a'), { key: 'run', startedAtMs: NOW - 5 * MINUTE }], 20 * MINUTE, NOW);
    expect(forecast.get('run')).toEqual({ arrivalAtMs: NOW + 15 * MINUTE, filmsAhead: 0 });
    expect(forecast.get('a')).toEqual({ arrivalAtMs: NOW + 35 * MINUTE, filmsAhead: 1 });
  });

  it('never forecasts a running film in the past', () => {
    const forecast = forecastFilmArrivals([{ key: 'run', startedAtMs: NOW - 90 * MINUTE }], 20 * MINUTE, NOW);
    expect(forecast.get('run')?.arrivalAtMs).toBe(NOW);
  });

  it('forecasts strictly increasing arrivals along the queue', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 1, max: 100 * MINUTE }), (count, typical) => {
        const slots = Array.from({ length: count }, (_unused, position) => queued(`film-${position}`));
        const arrivals = [...forecastFilmArrivals(slots, typical, NOW).values()].map((entry) => entry.arrivalAtMs);
        return arrivals.every((arrival, position) => position === 0 || arrival > (arrivals[position - 1] ?? 0));
      }),
    );
  });
});
