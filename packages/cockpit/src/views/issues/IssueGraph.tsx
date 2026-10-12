import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { IssueView } from '../../contract/index.ts';
import { ISSUE_STATE_LABELS, issueTypeLabel } from '../../i18n/labels.ts';
import { paths } from '../../model/routes.ts';
import type { StatusMark as StatusMarkKind } from '../../model/status.ts';
import { issueMark, STATUS_MARKS } from '../../model/status.ts';
import { STATUS_MARK_LABELS } from '../../ui/components/StatusMark.tsx';
import { IconButton } from '../../ui/components/IconButton.tsx';
import { edgePath, GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, layoutIssueGraph } from './issue-graph-layout.ts';

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.6;
const TITLE_MAX_CHARACTERS = 30;
const MARK_RADIUS = 5;

function shorten(text: string): string {
  return text.length <= TITLE_MAX_CHARACTERS ? text : `${text.slice(0, TITLE_MAX_CHARACTERS - 1)}…`;
}

export function IssueGraph({ issues }: { readonly issues: readonly IssueView[] }) {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(1);
  const graph = useMemo(() => layoutIssueGraph(issues), [issues]);
  const byNumber = useMemo(() => new Map(issues.map((issue) => [issue.number, issue])), [issues]);
  const usedMarks = STATUS_MARKS.filter((mark) => issues.some((issue) => issueMark(issue.state) === mark));
  const open = (number: number) => void navigate(paths.issue(number));
  return (
    <div className="issue-graph">
      <div className="issue-graph__toolbar">
        <ul className="issue-graph__legend" aria-label="Légende">
          {usedMarks.map((mark: StatusMarkKind) => (
            <li key={mark}>
              <span className={`issue-graph__swatch issue-graph__swatch--${mark}`} aria-hidden="true" />
              {STATUS_MARK_LABELS[mark]}
            </li>
          ))}
        </ul>
        <div className="issue-graph__zoom">
          <IconButton size="sm" label="Dézoomer" icon={<Minus size={14} />} onClick={() => setZoom((value) => Math.max(ZOOM_MIN, value - ZOOM_STEP))} />
          <span className="issue-graph__zoom-value num">{Math.round(zoom * 100)} %</span>
          <IconButton size="sm" label="Zoomer" icon={<Plus size={14} />} onClick={() => setZoom((value) => Math.min(ZOOM_MAX, value + ZOOM_STEP))} />
          <IconButton size="sm" label="Réinitialiser le zoom" icon={<RotateCcw size={13} />} onClick={() => setZoom(1)} />
        </div>
      </div>
      <div className="issue-graph__viewport" tabIndex={-1}>
        <svg
          className="issue-graph__canvas"
          width={graph.width * zoom}
          height={graph.height * zoom}
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          role="group"
          aria-label="Graphe des dépendances entre issues"
        >
          <defs>
            <marker id="issue-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="issue-graph__arrow" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const blocking = byNumber.get(edge.to)?.state === 'blocked';
            return <path key={`${edge.from}-${edge.to}`} d={edgePath(edge.points)} className={`issue-graph__edge${blocking ? ' is-blocking' : ''}`} markerEnd="url(#issue-graph-arrow)" />;
          })}
          {graph.nodes.map((node) => {
            const issue = byNumber.get(node.number);
            if (issue === undefined) return null;
            const mark = issueMark(issue.state);
            return (
              <g
                key={node.number}
                transform={`translate(${node.x} ${node.y})`}
                className={`issue-node issue-node--${mark}`}
                role="link"
                tabIndex={0}
                aria-label={`#${issue.number} ${issue.title} — ${ISSUE_STATE_LABELS[issue.state]}`}
                onClick={() => open(issue.number)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open(issue.number);
                  }
                }}
              >
                <rect className="issue-node__box" width={GRAPH_NODE_WIDTH} height={GRAPH_NODE_HEIGHT} rx={10} />
                <rect className="issue-node__accent" x={0} y={10} width={3} height={GRAPH_NODE_HEIGHT - 20} rx={1.5} />
                <circle className="issue-node__mark" cx={GRAPH_NODE_WIDTH - 16} cy={17} r={MARK_RADIUS} />
                <text className="issue-node__number" x={14} y={22}>
                  #{issue.number}
                  <tspan className="issue-node__type" dx={8}>
                    {issueTypeLabel(issue.type)}
                  </tspan>
                </text>
                <text className="issue-node__title" x={14} y={40}>
                  {shorten(issue.title)}
                </text>
                <text className="issue-node__state" x={14} y={55}>
                  {ISSUE_STATE_LABELS[issue.state]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
