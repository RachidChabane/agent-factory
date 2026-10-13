import { describe, expect, it } from 'vitest';
import { evidenceIsComplete, incompleteEvidenceLines } from './evidence.ts';
import { describeOmission } from './evidence-omission.ts';
import type { EvidenceBundle } from './journal-events.ts';

const BUNDLE: EvidenceBundle = {
  directory: '.evidence/42',
  beforeLogPath: null,
  afterLogPath: '.evidence/42/after-log.txt',
  diffStatPath: '.evidence/42/diffstat.txt',
  acceptanceTestsPath: null,
  files: [],
  missing: [],
  omitted: [],
};

describe('the words for a file the limits keep off the pull request', () => {
  it('tell the size, the limit it passed and the setting that raises it', () => {
    expect(describeOmission({ bytes: 6_200_000, reason: 'file-limit', limitBytes: 5_000_000 })).toBe('6.2 MB, over the limit of 5 MB per file (evidence.maxFileBytes)');
    expect(describeOmission({ bytes: 3_000_000, reason: 'total-limit', limitBytes: 40_000_000 })).toBe(
      '3 MB, the evidence of the pull request would pass its limit of 40 MB in total (evidence.maxTotalBytes)',
    );
  });
});

describe('the completeness of the evidence of a pull request', () => {
  const missing = { phase: 'before' as const, sourcePath: 'app/trace.zip' };
  const omitted = { phase: 'after' as const, sourcePath: 'app/header.png', caption: 'header.png', bytes: 6_200_000, reason: 'file-limit' as const, limitBytes: 5_000_000 };

  it('is complete when every file declared was produced and committed', () => {
    expect(evidenceIsComplete(BUNDLE)).toBe(true);
    expect(incompleteEvidenceLines(BUNDLE)).toEqual([]);
  });

  it('is incomplete when a file was not produced, and says which', () => {
    const bundle = { ...BUNDLE, missing: [missing] };
    expect(evidenceIsComplete(bundle)).toBe(false);
    expect(incompleteEvidenceLines(bundle)).toEqual(['app/trace.zip (before)']);
  });

  it('is incomplete when a file was left out by the limits, and says which and why', () => {
    const bundle = { ...BUNDLE, omitted: [omitted] };
    expect(evidenceIsComplete(bundle)).toBe(false);
    expect(incompleteEvidenceLines(bundle)).toEqual(['app/header.png (after): left out, 6.2 MB, over the limit of 5 MB per file (evidence.maxFileBytes)']);
  });

  it('lists the files not produced before the files left out', () => {
    expect(incompleteEvidenceLines({ ...BUNDLE, missing: [missing], omitted: [omitted] })).toHaveLength(2);
    expect(incompleteEvidenceLines({ ...BUNDLE, missing: [missing], omitted: [omitted] })[0]).toBe('app/trace.zip (before)');
  });
});
