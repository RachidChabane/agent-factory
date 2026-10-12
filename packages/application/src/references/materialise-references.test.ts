import { describe, expect, it } from 'vitest';
import { ReferencesNotReadyError } from './reference-errors.ts';
import { materialiseReferences, requireReferences } from './materialise-references.ts';
import { FakeReferenceSnapshots, FAKE_COMMIT, ICONS, TOKENS } from './testing/reference-fakes.ts';

describe('materialiseReferences', () => {
  it('reports one outcome per reference, in order, and keeps going after a failure', async () => {
    const snapshots = new FakeReferenceSnapshots();
    snapshots.sourcesWithoutRef.add(TOKENS.name);

    const outcomes = await materialiseReferences(snapshots, [TOKENS, ICONS]);

    expect(outcomes.map((outcome) => outcome.ok)).toEqual([false, true]);
    expect(outcomes[0]).toMatchObject({ message: expect.stringContaining('git -C /clones/design-tokens fetch --tags') });
    expect(outcomes[1]).toMatchObject({ snapshot: { name: 'icons', commit: FAKE_COMMIT, change: 'created' } });
  });

  it('says what it did to a snapshot that was there already', async () => {
    const snapshots = new FakeReferenceSnapshots();
    await materialiseReferences(snapshots, [TOKENS]);
    snapshots.commit = 'd'.repeat(40);

    const [rebuilt] = await materialiseReferences(snapshots, [TOKENS]);
    const [unchanged] = await materialiseReferences(snapshots, [TOKENS]);

    expect(rebuilt).toMatchObject({ snapshot: { change: 'rebuilt' } });
    expect(unchanged).toMatchObject({ snapshot: { change: 'unchanged' } });
  });

  it('has nothing to report without references', async () => {
    expect(await materialiseReferences(new FakeReferenceSnapshots(), [])).toEqual([]);
  });
});

describe('requireReferences', () => {
  it('returns every snapshot when all references are ready', async () => {
    const snapshots = await requireReferences(new FakeReferenceSnapshots(), [TOKENS, ICONS]);
    expect(snapshots.map((snapshot) => snapshot.path)).toEqual(['/references/design-tokens@v1.0.0', '/references/icons@v2']);
  });

  it('refuses with every problem when references cannot be materialised', async () => {
    const snapshots = new FakeReferenceSnapshots();
    snapshots.sourcesWithoutRef.add(TOKENS.name);
    snapshots.unreadableSources.add(ICONS.name);

    const failure = await requireReferences(snapshots, [TOKENS, ICONS]).catch((error: unknown) => error);

    if (!(failure instanceof ReferencesNotReadyError)) throw failure;
    expect(failure.problems).toHaveLength(2);
    expect(failure.message).toContain('reference repositories are not ready:');
    expect(failure.message).toContain('- reference design-tokens:');
    expect(failure.message).toContain('- reference icons:');
  });
});
