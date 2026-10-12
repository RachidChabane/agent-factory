/** How many of the latest successful films the typical duration is taken from. */
export const FILM_HISTORY_SIZE = 5;
const MIDDLE_DIVISOR = 2;

/** One film of the installation's queue; a film that has not started has no start. */
export interface FilmSlot {
  readonly key: string;
  readonly startedAtMs: number | null;
}

export interface FilmForecastEntry {
  readonly arrivalAtMs: number;
  /** The films that finish before this one, the running film included. */
  readonly filmsAhead: number;
}

/** The median of the latest durations, or the fallback while no film has succeeded yet. */
export function typicalFilmDurationMs(recentDurationsMs: readonly number[], fallbackMs: number): number {
  const recent = recentDurationsMs.slice(-FILM_HISTORY_SIZE).toSorted((left, right) => left - right);
  if (recent.length === 0) return fallbackMs;
  const middle = Math.floor(recent.length / MIDDLE_DIVISOR);
  const upper = recent[middle] ?? fallbackMs;
  if (recent.length % MIDDLE_DIVISOR === 1) return upper;
  const lower = recent[middle - 1] ?? upper;
  return Math.round((lower + upper) / MIDDLE_DIVISOR);
}

/**
 * When each film of the queue ends: the running film's remainder, then one typical film for each
 * film ahead and for the film itself. The queue is the installation's, so films of every project
 * stand in the same line.
 */
export function forecastFilmArrivals(slots: readonly FilmSlot[], typicalMs: number, nowMs: number): ReadonlyMap<string, FilmForecastEntry> {
  const running = slots.filter((slot) => slot.startedAtMs !== null);
  const queued = slots.filter((slot) => slot.startedAtMs === null);
  const forecast = new Map<string, FilmForecastEntry>();
  let cursorMs = nowMs;
  for (const [filmsAhead, slot] of [...running, ...queued].entries()) {
    cursorMs = slot.startedAtMs === null ? cursorMs + typicalMs : Math.max(cursorMs, slot.startedAtMs + typicalMs);
    forecast.set(slot.key, { arrivalAtMs: cursorMs, filmsAhead });
  }
  return forecast;
}
