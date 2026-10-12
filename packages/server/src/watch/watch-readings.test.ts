import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BLOCKER_KINDS, type Blocker } from './blocker.ts';
import { diffBlockers } from './blocker-transitions.ts';
import { issueView, READ_AT, storefrontWith } from './testing/watched-snapshots.ts';
import { blockersAfter, unreachableBlocker, type Reading } from './watch-readings.ts';

const ESCALATED = issueView(12, { state: 'needs-human', escalation: { reason: 'stop', diagnosis: '', since: '2026-10-12T13:00:00.000Z' } });
const snapshotReading = (snapshot = storefrontWith([ESCALATED])): Reading => ({ kind: 'snapshot', at: READ_AT, snapshot });
const unreachable = (reason = 'connection refused'): Reading => ({ kind: 'unreachable', at: READ_AT, reason });

describe('the blockers after a reading', () => {
  it('are the blockers of a snapshot', () => {
    expect(blockersAfter([], snapshotReading()).map((blocker) => blocker.kind)).toEqual([BLOCKER_KINDS.needsHuman]);
  });

  it('keep what was known while the factory cannot be read, and add the unreachable cockpit', () => {
    const known = blockersAfter([], snapshotReading());
    const down = blockersAfter(known, unreachable());
    expect(down.map((blocker) => blocker.kind)).toEqual([BLOCKER_KINDS.cockpitUnreachable, BLOCKER_KINDS.needsHuman]);
    expect(diffBlockers(known, down).map((transition) => [transition.kind, transition.blocker.kind])).toEqual([['appeared', BLOCKER_KINDS.cockpitUnreachable]]);
  });

  it('report the unreachable cockpit once, whatever the reason changes to, and clear it when the factory answers', () => {
    const first = blockersAfter([], unreachable('connection refused'));
    const second = blockersAfter(first, unreachable('no answer within 10 s'));
    expect(diffBlockers(first, second)).toEqual([]);
    const back = blockersAfter(second, snapshotReading(storefrontWith([])));
    expect(diffBlockers(second, back).map((transition) => [transition.kind, transition.blocker.kind])).toEqual([['cleared', BLOCKER_KINDS.cockpitUnreachable]]);
  });

  it('show the blockers that persisted across an outage as unchanged when the factory answers again', () => {
    const before = blockersAfter([], snapshotReading());
    const down = blockersAfter(before, unreachable());
    const back = blockersAfter(down, snapshotReading());
    expect(diffBlockers(down, back).map((transition) => [transition.kind, transition.blocker.kind])).toEqual([['cleared', BLOCKER_KINDS.cockpitUnreachable]]);
  });

  it('never clear a blocker because the factory could not be read', () => {
    const readings = fc.array(fc.constantFrom('snapshot-with', 'snapshot-without', 'down'), { maxLength: 12 });
    fc.assert(
      fc.property(readings, (script) => {
        let blockers: readonly Blocker[] = [];
        for (const step of script) {
          const reading = step === 'down' ? unreachable() : snapshotReading(step === 'snapshot-with' ? storefrontWith([ESCALATED]) : storefrontWith([]));
          const next = blockersAfter(blockers, reading);
          const cleared = diffBlockers(blockers, next).filter((transition) => transition.kind === 'cleared').map((transition) => transition.blocker.kind);
          if (step === 'down' && cleared.length > 0) return false;
          blockers = next;
        }
        return true;
      }),
    );
  });

  it('name the unreachable cockpit by one key that does not depend on the reason', () => {
    expect(unreachableBlocker('a').key).toBe(unreachableBlocker('b').key);
  });
});
