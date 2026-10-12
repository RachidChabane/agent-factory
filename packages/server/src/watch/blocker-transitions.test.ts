import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BLOCKER_KINDS, type Blocker, type BlockerKind } from './blocker.ts';
import { diffBlockers } from './blocker-transitions.ts';

const KINDS: readonly BlockerKind[] = Object.values(BLOCKER_KINDS);

function blocker(key: string, detail = 'why', kind: BlockerKind = BLOCKER_KINDS.needsHuman): Blocker {
  return { key, kind, project: 'storefront', issue: 12, detail };
}

const blockerArbitrary = fc.record({
  key: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'),
  kind: fc.constantFrom(...KINDS),
  project: fc.constantFrom('storefront', 'ledger', null),
  issue: fc.constantFrom(12, 13, null),
  detail: fc.string({ maxLength: 20 }),
});

/** A reading lists each key once, as a detector registry guarantees. */
const readingArbitrary = fc.uniqueArray(blockerArbitrary, { selector: (candidate) => candidate.key, maxLength: 6 });

const keysOf = (blockers: readonly Blocker[]): string[] => blockers.map((candidate) => candidate.key).sort();

describe('the change between two readings', () => {
  it('says that a blocker appeared and that another cleared, the cleared ones first', () => {
    const transitions = diffBlockers([blocker('a'), blocker('b')], [blocker('b'), blocker('c')]);
    expect(transitions.map((transition) => [transition.kind, transition.blocker.key])).toEqual([
      ['cleared', 'a'],
      ['appeared', 'c'],
    ]);
  });

  it('reports every blocker of a first reading, compared with nothing', () => {
    expect(diffBlockers([], [blocker('a'), blocker('b')]).map((transition) => transition.kind)).toEqual(['appeared', 'appeared']);
  });

  it('reports nothing when a blocker stays, whatever its detail now says', () => {
    expect(diffBlockers([blocker('a', 'in implementing for 11 min')], [blocker('a', 'in implementing for 31 min')])).toEqual([]);
  });

  it('reports nothing when nothing changed', () => {
    fc.assert(fc.property(readingArbitrary, (reading) => diffBlockers(reading, reading).length === 0));
  });

  it('mirrors an appearance as a clearing when the readings are read the other way round', () => {
    fc.assert(
      fc.property(readingArbitrary, readingArbitrary, (before, after) => {
        const forward = diffBlockers(before, after);
        const backward = diffBlockers(after, before);
        const appeared = (transitions: typeof forward) => keysOf(transitions.filter((transition) => transition.kind === 'appeared').map((transition) => transition.blocker));
        const cleared = (transitions: typeof forward) => keysOf(transitions.filter((transition) => transition.kind === 'cleared').map((transition) => transition.blocker));
        return JSON.stringify(appeared(forward)) === JSON.stringify(cleared(backward)) && JSON.stringify(cleared(forward)) === JSON.stringify(appeared(backward));
      }),
    );
  });

  it('leads from the first reading to the second when its transitions are applied', () => {
    fc.assert(
      fc.property(readingArbitrary, readingArbitrary, (before, after) => {
        const present = new Set(keysOf(before));
        for (const transition of diffBlockers(before, after)) {
          if (transition.kind === 'cleared') present.delete(transition.blocker.key);
          else present.add(transition.blocker.key);
        }
        return JSON.stringify([...present].sort()) === JSON.stringify(keysOf(after));
      }),
    );
  });
});
