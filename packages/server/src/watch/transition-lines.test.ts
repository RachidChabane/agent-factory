import { describe, expect, it } from 'vitest';
import { BLOCKER_KINDS, type Blocker } from './blocker.ts';
import { readingTimeText, transitionJson, transitionLine, whereOf } from './transition-lines.ts';

const AT = new Date('2026-10-12T14:03:20.512Z');
const ESCALATED: Blocker = { key: 'needs-human|storefront|12|x', kind: BLOCKER_KINDS.needsHuman, project: 'storefront', issue: 12, detail: 'the before proof is not valid' };

describe('the lines of the report', () => {
  it('start with the reading time in UTC, to the second', () => {
    expect(readingTimeText(AT)).toBe('2026-10-12T14:03:20Z');
  });

  it('say where a blocker is: an issue, a project, or the whole factory', () => {
    expect(whereOf(ESCALATED)).toBe('storefront#12');
    expect(whereOf({ ...ESCALATED, issue: null })).toBe('storefront');
    expect(whereOf({ ...ESCALATED, project: null, issue: null })).toBe('factory');
  });

  it('give the reason of a blocker that appears and only the name of one that clears', () => {
    expect(transitionLine(AT, { kind: 'appeared', blocker: ESCALATED })).toBe('2026-10-12T14:03:20Z blocked needs-human storefront#12: the before proof is not valid');
    expect(transitionLine(AT, { kind: 'cleared', blocker: ESCALATED })).toBe('2026-10-12T14:03:20Z cleared needs-human storefront#12');
  });

  it('write the same transition as one JSON object on one line', () => {
    const line = transitionJson(AT, { kind: 'appeared', blocker: ESCALATED });
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      at: '2026-10-12T14:03:20.512Z',
      transition: 'blocked',
      kind: 'needs-human',
      project: 'storefront',
      issue: 12,
      key: 'needs-human|storefront|12|x',
      detail: 'the before proof is not valid',
    });
    expect(JSON.parse(transitionJson(AT, { kind: 'cleared', blocker: ESCALATED }))).toMatchObject({ transition: 'cleared', kind: 'needs-human', issue: 12 });
  });
});
