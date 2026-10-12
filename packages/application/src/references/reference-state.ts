import type { ReferenceSnapshotStatus } from '@agent-factory/domain';
import { ReferenceSourceUnreadableError } from './reference-errors.ts';
import type { ReferenceSnapshots, ReferenceSource } from './reference-ports.ts';

export interface ReferenceState {
  readonly status: ReferenceSnapshotStatus;
  /** The commit of the snapshot when it is ready, the one the source's ref resolves to when it is not built yet, otherwise null. */
  readonly commit: string | null;
}

const MISSING_REF: ReferenceState = { status: 'missing-ref', commit: null };

/** Where a reference stands: usable, waiting to be built from its source, or impossible to build because the source lacks the ref. */
export async function referenceState(snapshots: ReferenceSnapshots, reference: ReferenceSource): Promise<ReferenceState> {
  const stored = await snapshots.inspect(reference);
  if (stored.commit !== null) return { status: 'ready', commit: stored.commit };
  try {
    const resolved = await snapshots.resolve(reference);
    return resolved === null ? MISSING_REF : { status: 'not-built', commit: resolved };
  } catch (error) {
    if (error instanceof ReferenceSourceUnreadableError) return MISSING_REF;
    throw error;
  }
}
