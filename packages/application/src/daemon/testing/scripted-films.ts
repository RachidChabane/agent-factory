import type { FilmOutcome } from '../../film/film-behaviour.ts';
import type { FilmBodyRefresh } from '../../film/film-bodies.ts';
import type { FilmOrder, QueuedFilm } from '../../film/film-order.ts';
import type { FilmRunner } from '../../film/film-runner.ts';

export function order(issueNumber: number, scenario: string): FilmOrder {
  return { issueNumber, scenario, operator: 'Alex Morgan' };
}

/** The films of a project that the lane asks for, and what it did with them. */
export class ScriptedFilms implements FilmRunner {
  queued: QueuedFilm[] = [];
  declared: FilmOrder[] = [];
  prepareError: Error | null = null;
  readonly prepared: FilmOrder[] = [];
  readonly filmed: FilmOrder[] = [];
  readonly failures: { order: FilmOrder; reason: string }[] = [];
  refreshes = 0;
  private finishing: ((outcome: FilmOutcome) => void) | null = null;

  prepare(next: FilmOrder): Promise<unknown> {
    this.prepared.push(next);
    return this.prepareError === null ? Promise.resolve() : Promise.reject(this.prepareError);
  }

  film(next: FilmOrder, signal: AbortSignal): Promise<FilmOutcome> {
    this.filmed.push(next);
    return new Promise<FilmOutcome>((resolve, reject) => {
      this.finishing = resolve;
      signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true });
    });
  }

  finish(outcome: FilmOutcome): void {
    this.queued = [];
    this.finishing?.(outcome);
  }

  order(): Promise<void> {
    return Promise.resolve();
  }

  orderDeclared(): Promise<readonly FilmOrder[]> {
    const orders = this.declared;
    this.declared = [];
    return Promise.resolve(orders);
  }

  next(): Promise<QueuedFilm | null> {
    return Promise.resolve(this.queued[0] ?? null);
  }

  fail(failed: FilmOrder, reason: string): Promise<void> {
    this.failures.push({ order: failed, reason });
    this.queued = this.queued.filter((queued) => queued.order.scenario !== failed.scenario);
    return Promise.resolve();
  }

  refreshBodies(): Promise<FilmBodyRefresh> {
    this.refreshes += 1;
    return Promise.resolve({ updated: [], failed: [] });
  }
}

export function finished(issueNumber: number, scenario: string): FilmOutcome {
  const phase = { video: 'v', report: 'r', screenshots: [], facts: [], storeVideo: 's', storeScreenshots: [], omitted: [] };
  return { kind: 'finished', issueNumber, pullRequestNumber: 100 + issueNumber, scenario, commitSha: 'films000', before: phase, after: phase };
}
