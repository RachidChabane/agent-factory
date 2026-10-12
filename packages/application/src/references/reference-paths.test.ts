import { describe, expect, it } from 'vitest';
import { referenceSnapshotPath } from './reference-paths.ts';

describe('referenceSnapshotPath', () => {
  it('puts the snapshot of a reference in its project directory, named after the name and the ref', () => {
    expect(referenceSnapshotPath('/home/projects/storefront/references', { name: 'design-tokens', ref: 'v1.0.0' })).toBe(
      '/home/projects/storefront/references/design-tokens@v1.0.0',
    );
  });

  it('keeps two refs of one reference apart', () => {
    expect(referenceSnapshotPath('/r', { name: 'icons', ref: 'v1' })).not.toBe(referenceSnapshotPath('/r', { name: 'icons', ref: 'v2' }));
  });
});
