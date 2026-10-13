import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { selectEvidenceWithinLimits, type EvidenceLimits, type WeighedFile } from './evidence-limits.ts';

const LIMITS: EvidenceLimits = { maxFileBytes: 100, maxTotalBytes: 250 };

function files(...sizes: readonly number[]): readonly WeighedFile[] {
  return sizes.map((bytes, position) => ({ path: `file-${position}.png`, bytes }));
}

const paths = (list: readonly WeighedFile[]): readonly string[] => list.map((file) => file.path);

describe('the evidence a pull request may carry', () => {
  it('keeps every file while each is within the file limit and the total within the total limit', () => {
    const selection = selectEvidenceWithinLimits(files(100, 100, 50), LIMITS);
    expect(paths(selection.kept)).toEqual(['file-0.png', 'file-1.png', 'file-2.png']);
    expect(selection.omitted).toEqual([]);
  });

  it('leaves out a file over the file limit, with its size and that limit', () => {
    const selection = selectEvidenceWithinLimits(files(10, 101, 20), LIMITS);
    expect(paths(selection.kept)).toEqual(['file-0.png', 'file-2.png']);
    expect(selection.omitted).toEqual([{ path: 'file-1.png', bytes: 101, reason: 'file-limit', limitBytes: 100 }]);
  });

  it('keeps a file of exactly the file limit and a total of exactly the total limit', () => {
    const selection = selectEvidenceWithinLimits(files(100, 100, 50), LIMITS);
    expect(selection.omitted).toEqual([]);
  });

  it('leaves files out largest first while the total passes the total limit', () => {
    const selection = selectEvidenceWithinLimits(files(90, 100, 95, 70), LIMITS);
    expect(paths(selection.kept)).toEqual(['file-0.png', 'file-3.png']);
    expect(selection.omitted).toEqual([
      { path: 'file-1.png', bytes: 100, reason: 'total-limit', limitBytes: 250 },
      { path: 'file-2.png', bytes: 95, reason: 'total-limit', limitBytes: 250 },
    ]);
  });

  it('stops leaving files out as soon as the total fits', () => {
    const selection = selectEvidenceWithinLimits(files(100, 90, 80, 10), LIMITS);
    expect(paths(selection.omitted)).toEqual(['file-0.png']);
  });

  it('leaves out the last of files of the same weight first', () => {
    const selection = selectEvidenceWithinLimits(files(100, 100, 100), LIMITS);
    expect(paths(selection.kept)).toEqual(['file-0.png', 'file-1.png']);
    expect(paths(selection.omitted)).toEqual(['file-2.png']);
  });

  it('does not count a file already left out for its own weight in the total', () => {
    const selection = selectEvidenceWithinLimits(files(500, 100, 100), LIMITS);
    expect(selection.omitted.map((file) => file.reason)).toEqual(['file-limit']);
  });

  it('counts the evidence the pull request already holds in the total', () => {
    const selection = selectEvidenceWithinLimits(files(100, 60, 40), LIMITS, 100);
    expect(paths(selection.omitted)).toEqual(['file-0.png']);
    expect(paths(selection.kept)).toEqual(['file-1.png', 'file-2.png']);
  });

  it('leaves out everything when what the pull request already holds passes the total limit', () => {
    const selection = selectEvidenceWithinLimits(files(10, 20), LIMITS, 300);
    expect(selection.kept).toEqual([]);
    expect(selection.omitted.map((file) => file.reason)).toEqual(['total-limit', 'total-limit']);
  });

  it('has nothing to select among no files', () => {
    expect(selectEvidenceWithinLimits([], LIMITS)).toEqual({ kept: [], omitted: [] });
  });

  describe('whatever the files and the limits', () => {
    const weighed = fc.array(fc.integer({ min: 0, max: 1_000 }), { maxLength: 25 }).map((sizes) => files(...sizes));
    const limits = fc.record({ maxFileBytes: fc.integer({ min: 1, max: 600 }), maxTotalBytes: fc.integer({ min: 1, max: 2_000 }) });
    const committed = fc.integer({ min: 0, max: 500 });

    it('keeps or leaves out every file exactly once, in the order given', () => {
      fc.assert(
        fc.property(weighed, limits, committed, (list, bounds, held) => {
          const { kept, omitted } = selectEvidenceWithinLimits(list, bounds, held);
          const position = (path: string): number => list.findIndex((file) => file.path === path);
          const ordered = (selected: readonly WeighedFile[]): boolean => selected.every((file, index) => index === 0 || position(selected[index - 1]?.path ?? '') < position(file.path));
          return kept.length + omitted.length === list.length && ordered(kept) && ordered(omitted) && new Set([...paths(kept), ...paths(omitted)]).size === list.length;
        }),
      );
    });

    it('keeps no file over the file limit and a total within the total limit', () => {
      fc.assert(
        fc.property(weighed, limits, committed, (list, bounds, held) => {
          const { kept } = selectEvidenceWithinLimits(list, bounds, held);
          const total = held + kept.reduce((sum, file) => sum + file.bytes, 0);
          return kept.every((file) => file.bytes <= bounds.maxFileBytes) && (total <= bounds.maxTotalBytes || kept.length === 0);
        }),
      );
    });

    it('leaves out for the total only files at least as heavy as every file it keeps', () => {
      fc.assert(
        fc.property(weighed, limits, committed, (list, bounds, held) => {
          const { kept, omitted } = selectEvidenceWithinLimits(list, bounds, held);
          return omitted.filter((file) => file.reason === 'total-limit').every((left) => kept.every((file) => file.bytes <= left.bytes));
        }),
      );
    });

    it('leaves out no more than the total limit asks: the lightest file left out for it would not have fit', () => {
      fc.assert(
        fc.property(weighed, limits, committed, (list, bounds, held) => {
          const { kept, omitted } = selectEvidenceWithinLimits(list, bounds, held);
          const dropped = omitted.filter((file) => file.reason === 'total-limit');
          const lightest = dropped.toSorted((left, right) => left.bytes - right.bytes)[0];
          if (lightest === undefined) return true;
          return held + kept.reduce((sum, file) => sum + file.bytes, 0) + lightest.bytes > bounds.maxTotalBytes;
        }),
      );
    });

    it('selects nothing more from what it kept', () => {
      fc.assert(
        fc.property(weighed, limits, committed, (list, bounds, held) => {
          const { kept } = selectEvidenceWithinLimits(list, bounds, held);
          return selectEvidenceWithinLimits(kept, bounds, held).omitted.length === 0;
        }),
      );
    });
  });
});
