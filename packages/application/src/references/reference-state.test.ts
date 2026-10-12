import { describe, expect, it } from 'vitest';
import { referenceState } from './reference-state.ts';
import { FakeReferenceSnapshots, FAKE_COMMIT, TOKENS } from './testing/reference-fakes.ts';

describe('referenceState', () => {
  it('is ready with the recorded commit when the snapshot is built', async () => {
    const snapshots = new FakeReferenceSnapshots();
    await snapshots.materialise(TOKENS);
    snapshots.commit = 'd'.repeat(40);

    expect(await referenceState(snapshots, TOKENS)).toEqual({ status: 'ready', commit: FAKE_COMMIT });
  });

  it('is not built, with the commit the source resolves to, before the first materialisation', async () => {
    expect(await referenceState(new FakeReferenceSnapshots(), TOKENS)).toEqual({ status: 'not-built', commit: FAKE_COMMIT });
  });

  it('is missing its ref when the source holds none, or is not a clone', async () => {
    const snapshots = new FakeReferenceSnapshots();
    snapshots.sourcesWithoutRef.add(TOKENS.name);
    expect(await referenceState(snapshots, TOKENS)).toEqual({ status: 'missing-ref', commit: null });

    const unreadable = new FakeReferenceSnapshots();
    unreadable.unreadableSources.add(TOKENS.name);
    expect(await referenceState(unreadable, TOKENS)).toEqual({ status: 'missing-ref', commit: null });
  });

  it('stays ready when the source lost the ref after the snapshot was built: the snapshot is frozen', async () => {
    const snapshots = new FakeReferenceSnapshots();
    await snapshots.materialise(TOKENS);
    snapshots.sourcesWithoutRef.add(TOKENS.name);

    expect(await referenceState(snapshots, TOKENS)).toEqual({ status: 'ready', commit: FAKE_COMMIT });
  });

  it('does not hide a failure that is not about the source', async () => {
    const snapshots = new FakeReferenceSnapshots();
    snapshots.resolve = () => Promise.reject(new Error('the disk is gone'));

    await expect(referenceState(snapshots, TOKENS)).rejects.toThrow('the disk is gone');
  });
});
