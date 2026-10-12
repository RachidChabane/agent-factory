import './issue-graph.css';
import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { IssueView } from '../../contract/index.ts';
import { issueMark, STATUS_MARKS } from '../../model/status.ts';
import { IssueCycleNotice } from './IssueCycleNotice.tsx';
import { edgePath, layoutIssueGraph } from './issue-graph-layout.ts';
import { dependencyCycles } from './issue-model.ts';
import { IssueGraphNode } from './IssueGraphNode.tsx';
import { IssueGraphZoom, ZOOM_DEFAULT_PERCENT, zoomScale } from './IssueGraphZoom.tsx';

const ARROW_ID = 'issue-graph-arrow';
const BLOCKING_ARROW_ID = 'issue-graph-arrow-blocking';

interface IssueGraphProps {
  readonly issues: readonly IssueView[];
}

function Legend({ issues, hasEdges, hasBlockingEdges }: { readonly issues: readonly IssueView[]; readonly hasEdges: boolean; readonly hasBlockingEdges: boolean }) {
  const { t } = useI18n();
  const usedMarks = STATUS_MARKS.filter((mark) => issues.some((issue) => issueMark(issue.state) === mark));
  return (
    <ul className="issue-graph__legend" aria-label={t('issues.graph.legend')}>
      {usedMarks.map((mark) => (
        <li key={mark}>
          <span className={`issue-graph__swatch issue-graph__swatch--${mark}`} aria-hidden="true" />
          {t(`mark.${mark}`)}
        </li>
      ))}
      {hasEdges ? (
        <li>
          <span className="issue-graph__line" aria-hidden="true" />
          {t('issues.graph.legendDependency')}
        </li>
      ) : null}
      {hasBlockingEdges ? (
        <li>
          <span className="issue-graph__line issue-graph__line--blocking" aria-hidden="true" />
          {t('issues.graph.legendBlocking')}
        </li>
      ) : null}
    </ul>
  );
}

function ArrowMarker({ id, blocking }: { readonly id: string; readonly blocking: boolean }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" className={`issue-graph__arrow${blocking ? ' is-blocking' : ''}`} />
    </marker>
  );
}

export function IssueGraph({ issues }: IssueGraphProps) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(ZOOM_DEFAULT_PERCENT);
  const graph = useMemo(() => layoutIssueGraph(issues), [issues]);
  const cycles = useMemo(() => dependencyCycles(issues), [issues]);
  const byNumber = useMemo(() => new Map(issues.map((issue) => [issue.number, issue])), [issues]);
  const scale = zoomScale(zoom);
  return (
    <div className="issue-graph">
      <div className="issue-graph__toolbar">
        <Legend issues={issues} hasEdges={graph.edges.length > 0} hasBlockingEdges={graph.edges.some((edge) => edge.blocking)} />
        <IssueGraphZoom percent={zoom} onChange={setZoom} />
      </div>
      {cycles.length === 0 ? null : <IssueCycleNotice cycles={cycles} />}
      {graph.edges.length === 0 ? <p className="issue-graph__note subtle">{t('issues.graph.noDependencies')}</p> : null}
      <div className="issue-graph__viewport" role="region" aria-label={t('issues.graph.label')} tabIndex={0}>
        <div className="issue-graph__sizer" style={{ width: graph.width * scale, height: graph.height * scale }}>
          <div className="issue-graph__canvas" style={{ width: graph.width, height: graph.height, transform: `scale(${scale})` }}>
            <svg className="issue-graph__edges" width={graph.width} height={graph.height} aria-hidden="true" focusable="false">
              <defs>
                <ArrowMarker id={ARROW_ID} blocking={false} />
                <ArrowMarker id={BLOCKING_ARROW_ID} blocking />
              </defs>
              {graph.edges.map((edge) => (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={edgePath(edge.points)}
                  className={`issue-graph__edge${edge.blocking ? ' is-blocking' : ''}`}
                  markerEnd={`url(#${edge.blocking ? BLOCKING_ARROW_ID : ARROW_ID})`}
                />
              ))}
            </svg>
            <ol className="issue-graph__nodes" aria-label={t('issues.graph.nodes')}>
              {graph.nodes.map((node) => {
                const issue = byNumber.get(node.number);
                return issue === undefined ? null : <IssueGraphNode key={node.number} issue={issue} node={node} />;
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
