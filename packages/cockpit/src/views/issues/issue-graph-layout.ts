import { Graph, layout } from '@dagrejs/dagre';
import type { EdgeLabel, GraphLabel, NodeLabel, Point } from '@dagrejs/dagre';
import type { IssueView } from '../../contract/index.ts';
import { dependenciesOf, isBlockingDependency } from './issue-model.ts';

export const GRAPH_NODE_WIDTH = 248;
export const GRAPH_NODE_HEIGHT = 84;
/** The extra height of a node that names dependencies the project does not hold. */
export const GRAPH_NODE_NOTE_HEIGHT = 34;
const GRAPH_DIRECTION = 'LR';
const NODE_SEPARATION = 20;
const RANK_SEPARATION = 72;
const GRAPH_MARGIN = 24;
const HALF = 2;

export interface PositionedNode {
  readonly number: number;
  /** The top left corner of the node. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The issues of the project this one waits for: the edges that end at it. */
  readonly dependsOn: readonly number[];
  /** The numbers the issue waits for that the project does not hold: named on the node, never drawn as edges. */
  readonly missingDependencies: readonly number[];
}

export interface PositionedEdge {
  /** The dependency. */
  readonly from: number;
  /** The issue that waits for it. */
  readonly to: number;
  readonly points: readonly Point[];
  readonly blocking: boolean;
}

export interface IssueGraphLayout {
  /** Left to right, then top to bottom, which is the order a keyboard visits them in. */
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
  readonly width: number;
  readonly height: number;
}

function nodeHeight(missingDependencies: readonly number[]): number {
  return missingDependencies.length === 0 ? GRAPH_NODE_HEIGHT : GRAPH_NODE_HEIGHT + GRAPH_NODE_NOTE_HEIGHT;
}

/** Lays the dependencies among the issues of a project out left to right: what an issue waits for stands to its left. */
export function layoutIssueGraph(issues: readonly IssueView[]): IssueGraphLayout {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>();
  graph.setGraph({ rankdir: GRAPH_DIRECTION, nodesep: NODE_SEPARATION, ranksep: RANK_SEPARATION, marginx: GRAPH_MARGIN, marginy: GRAPH_MARGIN });
  graph.setDefaultEdgeLabel(() => ({}));
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const dependencies = new Map(issues.map((issue) => [issue.number, dependenciesOf(issue, issues)]));
  for (const issue of issues) {
    graph.setNode(String(issue.number), { width: GRAPH_NODE_WIDTH, height: nodeHeight(dependencies.get(issue.number)?.missing ?? []) });
  }
  for (const issue of issues) {
    for (const dependency of dependencies.get(issue.number)?.held ?? []) {
      if (dependency.number !== issue.number) graph.setEdge(String(dependency.number), String(issue.number));
    }
  }
  layout(graph);
  const nodes = issues
    .map((issue): PositionedNode => {
      const placed = graph.node(String(issue.number));
      const missingDependencies = dependencies.get(issue.number)?.missing ?? [];
      const dependsOn = (dependencies.get(issue.number)?.held ?? []).map((dependency) => dependency.number).filter((number) => number !== issue.number);
      const height = nodeHeight(missingDependencies);
      return { number: issue.number, x: (placed.x ?? 0) - GRAPH_NODE_WIDTH / HALF, y: (placed.y ?? 0) - height / HALF, width: GRAPH_NODE_WIDTH, height, dependsOn, missingDependencies };
    })
    .toSorted((left, right) => left.x - right.x || left.y - right.y || left.number - right.number);
  const edges = graph.edges().map((edge): PositionedEdge => {
    const from = Number(edge.v);
    const to = Number(edge.w);
    const dependency = byNumber.get(from);
    const dependent = byNumber.get(to);
    return {
      from,
      to,
      points: graph.edge(edge).points ?? [],
      blocking: dependency !== undefined && dependent !== undefined && isBlockingDependency(dependency, dependent),
    };
  });
  const label = graph.graph();
  return { nodes, edges, width: label.width ?? 0, height: label.height ?? 0 };
}

/** An SVG path through the points dagre routed an edge along, with rounded corners. */
export function edgePath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  const commands = [`M${first.x} ${first.y}`];
  rest.forEach((current, index) => {
    const next = rest[index + 1];
    commands.push(next === undefined ? `L${current.x} ${current.y}` : `Q${current.x} ${current.y} ${(current.x + next.x) / HALF} ${(current.y + next.y) / HALF}`);
  });
  return commands.join(' ');
}
