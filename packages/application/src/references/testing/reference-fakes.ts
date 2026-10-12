import type { ReferenceRepository } from '@agent-factory/domain';
import { ReferenceRevisionNotFoundError, ReferenceSourceUnreadableError } from '../reference-errors.ts';
import { referenceSnapshotPath } from '../reference-paths.ts';
import type { ReferenceSnapshot, ReferenceSnapshots, ReferenceSource, StoredSnapshot } from '../reference-ports.ts';

export const FAKE_SNAPSHOTS_DIRECTORY = '/references';
export const FAKE_COMMIT = 'c'.repeat(40);

export const TOKENS: ReferenceSource = { name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0', source: '/clones/design-tokens' };
export const ICONS: ReferenceSource = { name: 'icons', repository: 'example-org/icons', ref: 'v2', source: '/clones/icons' };

/** Snapshots held in memory: a source can lack its ref or not be a clone, and a snapshot is a commit recorded under its path. */
export class FakeReferenceSnapshots implements ReferenceSnapshots {
  readonly sourcesWithoutRef = new Set<string>();
  readonly unreadableSources = new Set<string>();
  readonly built = new Map<string, string>();
  commit = FAKE_COMMIT;

  pathOf(reference: ReferenceRepository): string {
    return referenceSnapshotPath(FAKE_SNAPSHOTS_DIRECTORY, reference);
  }

  inspect(reference: ReferenceRepository): Promise<StoredSnapshot> {
    const path = this.pathOf(reference);
    return Promise.resolve({ path, commit: this.built.get(path) ?? null });
  }

  resolve(reference: ReferenceSource): Promise<string | null> {
    if (this.unreadableSources.has(reference.name)) return Promise.reject(new ReferenceSourceUnreadableError(reference, reference.source, 'not a repository'));
    return Promise.resolve(this.sourcesWithoutRef.has(reference.name) ? null : this.commit);
  }

  async materialise(reference: ReferenceSource): Promise<ReferenceSnapshot> {
    const commit = await this.resolve(reference);
    if (commit === null) throw new ReferenceRevisionNotFoundError(reference, reference.source);
    const path = this.pathOf(reference);
    const previous = this.built.get(path) ?? null;
    this.built.set(path, commit);
    const change = previous === null ? 'created' : previous === commit ? 'unchanged' : 'rebuilt';
    return { name: reference.name, repository: reference.repository, ref: reference.ref, commit, path, change };
  }
}
