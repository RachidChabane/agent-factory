import type { EventStore } from '@agent-factory/application';

const ALL_SUBJECTS = '';

export class SequenceCursor {
  private readonly events: EventStore;
  private last = 0;

  constructor(events: EventStore) {
    this.events = events;
  }

  async latest(): Promise<number> {
    const newer = await this.events.read(ALL_SUBJECTS, this.last);
    this.last = newer.at(-1)?.sequence ?? this.last;
    return this.last;
  }
}
