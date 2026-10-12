export interface FilmOrder {
  readonly issueNumber: number;
  readonly scenario: string;
  readonly operator: string;
}

/** A film waiting its turn, with the place the installation's log gave it in the queue. */
export interface QueuedFilm {
  readonly order: FilmOrder;
  readonly queuedSequence: number;
}
