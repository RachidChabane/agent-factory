import { describe, expect, it } from 'vitest';
import { SpecDraftSchema } from '../../contract/index.ts';
import type { ProposedSpec } from '../../contract/index.ts';
import type { SpecForm } from './spec-form.ts';
import { specDraftOf, specFormGaps, specFormOf, splitLines } from './spec-form.ts';

const SPEC: ProposedSpec = {
  id: 'spec-1',
  itemIds: ['item-1'],
  title: 'Show the tracking status',
  type: 'ui',
  need: 'Customers ask where the parcel is.',
  acceptanceCriteria: ['The page shows the latest event.', 'The number links to the carrier.'],
  outOfScope: ['Delay emails'],
  expectedProof: 'A browser journey.',
  problems: [],
  issueNumber: null,
};

const FILLED: SpecForm = { title: 'A title', type: 'ui', need: 'A need', criteria: 'One\nTwo', outOfScope: '', expectedProof: 'A proof' };

describe('splitLines', () => {
  it('trims every line and drops the empty ones', () => {
    expect(splitLines('  one \n\n two\r\n   \r\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('is empty for blank text', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines(' \n \n')).toEqual([]);
  });
});

describe('specFormOf', () => {
  it('writes the criteria and the exclusions one per line', () => {
    expect(specFormOf(SPEC)).toEqual({
      title: 'Show the tracking status',
      type: 'ui',
      need: 'Customers ask where the parcel is.',
      criteria: 'The page shows the latest event.\nThe number links to the carrier.',
      outOfScope: 'Delay emails',
      expectedProof: 'A browser journey.',
    });
  });

  it('gives back the spec it was made from', () => {
    expect(specDraftOf(specFormOf(SPEC))).toEqual({
      title: SPEC.title,
      type: SPEC.type,
      need: SPEC.need,
      acceptanceCriteria: SPEC.acceptanceCriteria,
      outOfScope: SPEC.outOfScope,
      expectedProof: SPEC.expectedProof,
    });
  });
});

describe('specDraftOf', () => {
  it('builds a draft the factory accepts, trimming the text and dropping blank lines', () => {
    const draft = specDraftOf({ ...FILLED, title: '  A title  ', criteria: ' One \n\n Two ', outOfScope: ' First \n\n', expectedProof: ' A proof ' });
    expect(draft).toEqual({ title: 'A title', type: 'ui', need: 'A need', acceptanceCriteria: ['One', 'Two'], outOfScope: ['First'], expectedProof: 'A proof' });
    expect(SpecDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('accepts a spec with nothing out of scope', () => {
    expect(specDraftOf(FILLED)?.outOfScope).toEqual([]);
  });

  it.each([
    ['a title', { title: '   ' }],
    ['a need', { need: '' }],
    ['a criterion', { criteria: ' \n ' }],
    ['a proof', { expectedProof: '\n' }],
  ] as const)('is null without %s', (_name, patch) => {
    expect(specDraftOf({ ...FILLED, ...patch })).toBeNull();
  });
});

describe('specFormGaps', () => {
  it('names every required part that is empty', () => {
    expect(specFormGaps({ ...FILLED, title: '', need: ' ', criteria: '', expectedProof: '' })).toEqual({ title: true, need: true, criteria: true, expectedProof: true });
  });

  it('reports no gap on a filled form, whatever the exclusions', () => {
    expect(specFormGaps(FILLED)).toEqual({ title: false, need: false, criteria: false, expectedProof: false });
  });
});
