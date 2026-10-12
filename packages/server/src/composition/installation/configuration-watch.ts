import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CONFIGURATION_EDITED_EVENT, SETTINGS_SUBJECT, type EventStore, type InstallationTask } from '@agent-factory/application';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';

/** Notices a hand edit of config.yaml, so the daemon reloads it without waiting for a restart. */
export class ConfigurationFileWatch implements InstallationTask {
  readonly name = 'watching the configuration file';
  private readonly path: string;
  private readonly events: EventStore;
  private known: string | null = null;

  constructor(path: string, events: EventStore) {
    this.path = path;
    this.events = events;
  }

  async run(): Promise<void> {
    const digest = createHash(DIGEST_ALGORITHM).update(await readFile(this.path)).digest(DIGEST_ENCODING);
    const previous = this.known;
    this.known = digest;
    if (previous === null || previous === digest) return;
    await this.events.append(CONFIGURATION_EDITED_EVENT, SETTINGS_SUBJECT, { digest });
  }
}
