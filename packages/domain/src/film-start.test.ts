import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideFilmStart, type QueuedFilmNeed } from './film-start.ts';
import { TOOL_STATUSES, type ToolStatus } from './tool-connection.ts';

const film = (project: string, queuedSequence: number, ...tools: readonly string[]): QueuedFilmNeed => ({ project, queuedSequence, tools });
const readings = (...entries: readonly (readonly [string, ToolStatus])[]): ReadonlyMap<string, ToolStatus> => new Map(entries);

describe('which film starts, and which films wait for a tool', () => {
  it('starts the film queued first when every tool of its project passes', () => {
    const queue = [film('ledger', 5, 'vault'), film('storefront', 2, 'vault', 'cloud')];
    const decision = decideFilmStart(queue, readings(['vault', 'connected'], ['cloud', 'connected']));
    expect(decision).toEqual({ start: film('storefront', 2, 'vault', 'cloud'), blocked: [] });
  });

  it('starts nothing from an empty queue', () => {
    expect(decideFilmStart([], readings())).toEqual({ start: null, blocked: [] });
  });

  it('starts a film that needs no tool whatever the readings say', () => {
    expect(decideFilmStart([film('storefront', 1)], readings(['vault', 'unauthenticated'])).start).toEqual(film('storefront', 1));
  });

  it('makes the films of a project wait for the first of its tools that fails, and starts none of them', () => {
    const decision = decideFilmStart([film('storefront', 1, 'vault', 'cloud')], readings(['vault', 'connected'], ['cloud', 'unauthenticated']));
    expect(decision).toEqual({ start: null, blocked: [{ project: 'storefront', tool: 'cloud', status: 'unauthenticated' }] });
  });

  it.each(['unauthenticated', 'missing', 'error'] as const)('holds a tool back whose status is %s', (status) => {
    expect(decideFilmStart([film('storefront', 1, 'vault')], readings(['vault', status])).blocked).toEqual([{ project: 'storefront', tool: 'vault', status }]);
  });

  it('goes on with the films of the other projects while one project waits, even when its film is first in the queue', () => {
    const queue = [film('storefront', 1, 'vault'), film('ledger', 2)];
    const decision = decideFilmStart(queue, readings(['vault', 'unauthenticated']));
    expect(decision.start).toEqual(film('ledger', 2));
    expect(decision.blocked).toEqual([{ project: 'storefront', tool: 'vault', status: 'unauthenticated' }]);
  });

  it('names a project once, whatever its films in the queue', () => {
    const queue = [film('storefront', 1, 'vault'), film('storefront', 3, 'vault'), film('ledger', 2, 'cloud')];
    const decision = decideFilmStart(queue, readings(['vault', 'missing'], ['cloud', 'error']));
    expect(decision.blocked).toEqual([
      { project: 'storefront', tool: 'vault', status: 'missing' },
      { project: 'ledger', tool: 'cloud', status: 'error' },
    ]);
  });

  it('does not hold against a film a tool nobody has read', () => {
    expect(decideFilmStart([film('storefront', 1, 'vault')], readings()).start).toEqual(film('storefront', 1, 'vault'));
  });

  it('goes in the order the films were queued, not the order they are given', () => {
    const decision = decideFilmStart([film('ledger', 9), film('storefront', 4), film('ledger', 6)], readings());
    expect(decision.start).toEqual(film('storefront', 4));
  });

  describe('whatever the queue and the readings', () => {
    const tools = ['vault', 'cloud', 'registry'] as const;
    const projects = ['storefront', 'ledger', 'catalog'] as const;
    const needs = fc.record({ storefront: fc.subarray([...tools]), ledger: fc.subarray([...tools]), catalog: fc.subarray([...tools]) });
    /** The films of a project all need the tools of the project. */
    const films: fc.Arbitrary<readonly QueuedFilmNeed[]> = fc
      .tuple(needs, fc.array(fc.record({ project: fc.constantFrom(...projects), queuedSequence: fc.integer({ min: 1, max: 50 }) }), { maxLength: 12 }))
      .map(([needed, list]) => list.map((entry) => ({ ...entry, tools: needed[entry.project] })));
    const statuses = fc.dictionary(fc.constantFrom(...tools), fc.constantFrom(...TOOL_STATUSES)).map((record) => new Map(Object.entries(record) as [string, ToolStatus][]));

    it('never starts a film of a project that waits', () => {
      fc.assert(
        fc.property(films, statuses, (queue, read) => {
          const { start, blocked } = decideFilmStart(queue, read);
          return start === null || !blocked.some((block) => block.project === start.project);
        }),
      );
    });

    it('starts a film whenever one of the queue has all its tools passing, and the first of those in the queue', () => {
      fc.assert(
        fc.property(films, statuses, (queue, read) => {
          const passing = queue.filter((candidate) => candidate.tools.every((tool) => (read.get(tool) ?? 'connected') === 'connected'));
          const first = passing.toSorted((left, right) => left.queuedSequence - right.queuedSequence)[0];
          return decideFilmStart(queue, read).start?.queuedSequence === first?.queuedSequence;
        }),
      );
    });

    it('makes a project wait exactly when one of the tools of one of its films fails', () => {
      fc.assert(
        fc.property(films, statuses, (queue, read) => {
          const failing = new Set(queue.filter((candidate) => candidate.tools.some((tool) => (read.get(tool) ?? 'connected') !== 'connected')).map((candidate) => candidate.project));
          const blocked = decideFilmStart(queue, read).blocked.map((block) => block.project);
          return blocked.length === failing.size && blocked.every((project) => failing.has(project));
        }),
      );
    });
  });
});
