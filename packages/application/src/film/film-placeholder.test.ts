import { describe, expect, it } from 'vitest';
import { filmCommandHint, renderFilmFailure, renderFilmPlaceholder } from './film-placeholder.ts';
import { FILM_PRESENTATION, MINUTE_MS } from './testing/film-fakes.ts';

const ARRIVAL_AT = Date.UTC(2026, 9, 12, 13, 30);

describe('film placeholder', () => {
  it('tells when the film is expected, in the zone of the project, and links the cockpit', () => {
    const text = renderFilmPlaceholder({
      scenario: 'checkout-flow',
      pullRequestNumber: 7,
      stage: null,
      forecast: { arrivalAtMs: ARRIVAL_AT, filmsAhead: 0 },
      presentation: FILM_PRESENTATION,
    });
    expect(text).toContain('### Scenario `checkout-flow`');
    expect(text).toContain('expected around 13:30 on 2026-10-12 (UTC)');
    expect(text).toContain('[Follow it in the cockpit](https://factory.example.test/projects/storefront/pull-requests/7)');
    expect(text).not.toContain('queued behind');
  });

  it('tells its place in the queue', () => {
    const forecast = { arrivalAtMs: ARRIVAL_AT + 20 * MINUTE_MS, filmsAhead: 2 };
    const text = renderFilmPlaceholder({ scenario: 'a', pullRequestNumber: 7, stage: null, forecast, presentation: FILM_PRESENTATION });
    expect(text).toContain('queued behind 2 films');
    expect(renderFilmPlaceholder({ scenario: 'a', pullRequestNumber: 7, stage: null, forecast: { ...forecast, filmsAhead: 1 }, presentation: FILM_PRESENTATION })).toContain('queued behind 1 film.');
  });

  it('tells what is recorded now while the film runs', () => {
    const forecast = { arrivalAtMs: ARRIVAL_AT, filmsAhead: 0 };
    const at = (stage: 'recording-base' | 'recording-head' | 'committing'): string =>
      renderFilmPlaceholder({ scenario: 'a', pullRequestNumber: 7, stage, forecast, presentation: FILM_PRESENTATION });
    expect(at('recording-base')).toContain('(the base is being recorded now)');
    expect(at('recording-head')).toContain('(the head is being recorded now)');
    expect(at('committing')).toContain('(the recordings are being committed now)');
  });

  it('gives no estimate and no link when it has none to give', () => {
    const text = renderFilmPlaceholder({
      scenario: 'a',
      pullRequestNumber: null,
      stage: null,
      forecast: null,
      presentation: { ...FILM_PRESENTATION, cockpitUrl: null },
    });
    expect(text).not.toContain('expected around');
    expect(text).not.toContain('cockpit');
  });
});

describe('film failure', () => {
  it('gives the reason on one line and how to order the film again', () => {
    const text = renderFilmFailure('storefront', 42, { scenario: 'checkout-flow', reason: 'the command exited\nwith 1' });
    expect(text).toContain('The recording of this scenario failed: the command exited with 1.');
    expect(text).toContain('`agent-factory film 42 --scenario checkout-flow --project storefront`');
  });

  it('names the command that orders a film', () => {
    expect(filmCommandHint('ledger', 9, 'month-end')).toBe('`agent-factory film 9 --scenario month-end --project ledger`');
  });
});
