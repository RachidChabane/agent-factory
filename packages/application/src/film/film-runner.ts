import type { FilmBodyRefresh } from './film-bodies.ts';
import type { FilmOutcome } from './film-behaviour.ts';
import type { FilmOrder, QueuedFilm } from './film-order.ts';

/** What the daemons ask of the films of one project. */
export interface FilmRunner {
  /** Checks that the film can start now: throws a deferral to wait, a refusal to fail it. */
  prepare(order: FilmOrder): Promise<unknown>;
  film(order: FilmOrder, signal: AbortSignal): Promise<FilmOutcome>;
  order(order: FilmOrder): Promise<void>;
  orderDeclared(): Promise<readonly FilmOrder[]>;
  next(): Promise<QueuedFilm | null>;
  fail(order: FilmOrder, reason: string): Promise<void>;
  refreshBodies(): Promise<FilmBodyRefresh>;
}
