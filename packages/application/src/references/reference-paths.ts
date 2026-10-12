import { join } from 'node:path';
import { referenceSnapshotName, type ReferenceRepository } from '@agent-factory/domain';

/** Where the snapshot of a reference lives in the directory that holds a project's snapshots: the one definition of that layout. */
export function referenceSnapshotPath(directory: string, reference: Pick<ReferenceRepository, 'name' | 'ref'>): string {
  return join(directory, referenceSnapshotName(reference));
}
