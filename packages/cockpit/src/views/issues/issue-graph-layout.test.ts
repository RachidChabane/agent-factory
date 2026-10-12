import type { IssueState } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import type { IssueView } from '../../contract/index.ts';
import { issueView } from '../../test/fixtures/seeds.ts';
import { edgePath, GRAPH_NODE_HEIGHT, GRAPH_NODE_NOTE_HEIGHT, GRAPH_NODE_WIDTH, layoutIssueGraph } from './issue-graph-layout.ts';

const MOMENT = '2026-10-12T09:00:00.000Z';

function issue(number: number, state: IssueState, dependsOn: readonly number[] = []): IssueView {
  return issueView({
    number,
    title: `Issue ${number}`,
    type: 'feature',
    state,
    dependsOn: [...dependsOn],
    spec: { need: 'A need', acceptanceCriteria: ['A criterion'], outOfScope: [], expectedProof: 'A proof' },
    createdAt: MOMENT,
    updatedAt: MOMENT,
    url: `https://forge.example.com/issues/${number}`,
  });
}

const nodeOf = (layout: ReturnType<typeof layoutIssueGraph>, number: number) => {
  const node = layout.nodes.find((entry) => entry.number === number);
  if (node === undefined) throw new Error(`no node for #${number}`);
  return node;
};

describe('layoutIssueGraph', () => {
  const chain = [issue(1, 'merged'), issue(2, 'implementing', [1]), issue(3, 'blocked', [2]), issue(4, 'spec-validated')];

  it('draws one edge per dependency among the issues, from the dependency to the issue that waits for it', () => {
    const layout = layoutIssueGraph(chain);
    expect(layout.edges.map((edge) => [edge.from, edge.to])).toEqual(expect.arrayContaining([[1, 2], [2, 3]]));
    expect(layout.edges).toHaveLength(2);
  });

  it('places what an issue waits for to its left', () => {
    const layout = layoutIssueGraph(chain);
    expect(nodeOf(layout, 1).x).toBeLessThan(nodeOf(layout, 2).x);
    expect(nodeOf(layout, 2).x).toBeLessThan(nodeOf(layout, 3).x);
  });

  it('holds one node per issue, whether or not it has a dependency', () => {
    const layout = layoutIssueGraph(chain);
    expect(layout.nodes.map((node) => node.number).toSorted((left, right) => left - right)).toEqual([1, 2, 3, 4]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('orders the nodes left to right, then top to bottom, for the keyboard', () => {
    const { nodes } = layoutIssueGraph(chain);
    for (let index = 1; index < nodes.length; index += 1) {
      const previous = nodes[index - 1];
      const current = nodes[index];
      if (previous === undefined || current === undefined) throw new Error('missing node');
      expect(previous.x < current.x || (previous.x === current.x && previous.y <= current.y)).toBe(true);
    }
  });

  it('marks as blocking only the edges that end at a blocked issue from a dependency that is not merged', () => {
    const layout = layoutIssueGraph([issue(1, 'implementing'), issue(2, 'blocked', [1]), issue(3, 'merged'), issue(4, 'blocked', [3]), issue(5, 'spec-validated', [1])]);
    const blocking = (from: number, to: number) => layout.edges.find((edge) => edge.from === from && edge.to === to)?.blocking;
    expect(blocking(1, 2)).toBe(true);
    expect(blocking(3, 4)).toBe(false);
    expect(blocking(1, 5)).toBe(false);
  });

  it('never draws an edge to an issue the project does not hold, and names it on the node instead', () => {
    const layout = layoutIssueGraph([issue(1, 'spec-draft', [31, 30]), issue(2, 'merged')]);
    expect(layout.edges).toEqual([]);
    expect(nodeOf(layout, 1).missingDependencies).toEqual([31, 30]);
    expect(nodeOf(layout, 2).missingDependencies).toEqual([]);
  });

  it('makes room for the note on a node that has one', () => {
    const layout = layoutIssueGraph([issue(1, 'spec-draft', [31]), issue(2, 'merged')]);
    expect(nodeOf(layout, 1).height).toBe(GRAPH_NODE_HEIGHT + GRAPH_NODE_NOTE_HEIGHT);
    expect(nodeOf(layout, 2).height).toBe(GRAPH_NODE_HEIGHT);
    expect(nodeOf(layout, 2).width).toBe(GRAPH_NODE_WIDTH);
  });

  it('lists on each node the issues of the project it waits for', () => {
    const layout = layoutIssueGraph([issue(1, 'merged'), issue(2, 'merged'), issue(3, 'implementing', [1, 2, 9])]);
    expect(nodeOf(layout, 3).dependsOn).toEqual([1, 2]);
    expect(nodeOf(layout, 1).dependsOn).toEqual([]);
  });

  it('counts a dependency written twice once', () => {
    const layout = layoutIssueGraph([issue(1, 'merged'), issue(2, 'implementing', [1, 1])]);
    expect(layout.edges).toHaveLength(1);
  });

  it('ignores an issue that waits for itself', () => {
    const layout = layoutIssueGraph([issue(1, 'spec-validated', [1])]);
    expect(layout.edges).toEqual([]);
    expect(layout.nodes).toHaveLength(1);
    expect(nodeOf(layout, 1).dependsOn).toEqual([]);
  });

  it('lays out issues that wait for each other without failing', () => {
    const layout = layoutIssueGraph([issue(1, 'spec-validated', [2]), issue(2, 'blocked', [1])]);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(2);
  });

  it('lays out no issue as an empty graph', () => {
    expect(layoutIssueGraph([])).toMatchObject({ nodes: [], edges: [] });
  });
});

describe('edgePath', () => {
  it('is empty without points', () => {
    expect(edgePath([])).toBe('');
  });

  it('starts at the first point and ends at the last', () => {
    expect(edgePath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M0 0 L10 0');
    expect(edgePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe('M0 0 Q10 0 10 5 L10 10');
  });

  it('is a single move for a single point', () => {
    expect(edgePath([{ x: 3, y: 4 }])).toBe('M3 4');
  });
});
