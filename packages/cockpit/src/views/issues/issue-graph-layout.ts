import { Graph, layout } from '@dagrejs/dagre';
import type { EdgeLabel, GraphLabel, NodeLabel, Point } from '@dagrejs/dagre';
import type { IssueView } from '../../contract/index.ts';

export const GRAPH_NODE_WIDTH = 236;
export const GRAPH_NODE_HEIGHT = 64;
const NODE_SEPARATION = 22;
const RANK_SEPARATION = 72;
const GRAPH_MARGIN = 24;

export interface PositionedNode {
  readonly number: number;
  readonly x: number;
  readonly y: number;
}

export interface PositionedEdge {
  readonly from: number;
  readonly to: number;
  readonly points: readonly Point[];
}

export interface IssueGraphLayout {
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
  readonly width: number;
  readonly height: number;
}

export function layoutIssueGraph(issues: readonly IssueView[]): IssueGraphLayout {
  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>();
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_SEPARATION, ranksep: RANK_SEPARATION, marginx: GRAPH_MARGIN, marginy: GRAPH_MARGIN });
  graph.setDefaultEdgeLabel(() => ({}));
  const known = new Set(issues.map((issue) => issue.number));
  for (const issue of issues) graph.setNode(String(issue.number), { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT });
  for (const issue of issues) {
    for (const dependency of issue.dependsOn) {
      if (known.has(dependency)) graph.setEdge(String(dependency), String(issue.number));
    }
  }
  layout(graph);
  const nodes = issues.map((issue) => {
    const node = graph.node(String(issue.number));
    return { number: issue.number, x: (node.x ?? 0) - GRAPH_NODE_WIDTH / 2, y: (node.y ?? 0) - GRAPH_NODE_HEIGHT / 2 };
  });
  const edges = graph.edges().map((edge) => ({
    from: Number(edge.v),
    to: Number(edge.w),
    points: graph.edge(edge).points ?? [],
  }));
  const label = graph.graph();
  return { nodes, edges, width: label.width ?? 0, height: label.height ?? 0 };
}

export function edgePath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  if (rest.length === 0) return `M${first.x} ${first.y}`;
  const commands = [`M${first.x} ${first.y}`];
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    const next = rest[index + 1];
    if (current === undefined) continue;
    if (next === undefined) {
      commands.push(`L${current.x} ${current.y}`);
    } else {
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      commands.push(`Q${current.x} ${current.y} ${midX} ${midY}`);
    }
  }
  return commands.join(' ');
}
