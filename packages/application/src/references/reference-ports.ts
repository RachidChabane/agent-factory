import type { ReferenceRepository } from '@agent-factory/domain';

/** A reference together with the local clone that holds its ref. */
export interface ReferenceSource extends ReferenceRepository {
  readonly source: string;
}

export const REFERENCE_CHANGES = ['created', 'rebuilt', 'unchanged'] as const;
export type ReferenceChange = (typeof REFERENCE_CHANGES)[number];

/** A snapshot at the commit its ref resolved to, and what materialising it did to the snapshot directory. */
export interface ReferenceSnapshot extends ReferenceRepository {
  readonly commit: string;
  readonly path: string;
  readonly change: ReferenceChange;
}

/** What a project's snapshot directory holds for a reference: the commit the snapshot was built from, null when no complete snapshot is there. */
export interface StoredSnapshot {
  readonly path: string;
  readonly commit: string | null;
}

/** The read-only snapshots of a project's reference repositories. */
export interface ReferenceSnapshots {
  /** Where the snapshot of the reference lives, whether or not it is built. */
  pathOf(reference: ReferenceRepository): string;
  /** What the snapshot directory holds now; the source is not consulted. */
  inspect(reference: ReferenceRepository): Promise<StoredSnapshot>;
  /** The commit the source's ref resolves to; null when the source holds no such ref. */
  resolve(reference: ReferenceSource): Promise<string | null>;
  /** Builds the snapshot unless it already holds the commit the ref resolves to; refuses when the source lacks the ref. */
  materialise(reference: ReferenceSource): Promise<ReferenceSnapshot>;
}
