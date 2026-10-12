import { useId } from 'react';
import { Link } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { issueMark } from '../../model/status.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { PositionedNode } from './issue-graph-layout.ts';
import { isBlocked } from './issue-model.ts';

interface IssueGraphNodeProps {
  readonly issue: IssueView;
  readonly node: PositionedNode;
}

function numbersList(numbers: readonly number[], list: (items: readonly string[]) => string): string {
  return list(numbers.map((number) => `#${number}`));
}

/** One issue of the graph: a link to its page, whose description names what it waits for since the edges are only drawn. */
export function IssueGraphNode({ issue, node }: IssueGraphNodeProps) {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const descriptionId = useId();
  const mark = issueMark(issue.state);
  const dependsOn = node.dependsOn.length === 0 ? null : t('issues.graph.dependsOn', { issues: numbersList(node.dependsOn, fmt.list) });
  return (
    <li className="issue-graph__item" style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>
      <Link to={paths.issue(project.id, issue.number)} className={`issue-node issue-node--${mark}${isBlocked(issue) ? ' is-blocked' : ''}`} aria-describedby={dependsOn === null ? undefined : descriptionId}>
        <span className="issue-node__head">
          <span className="issue-node__number num">#{issue.number}</span>
          <span className="issue-node__type truncate">{vocabulary.issueType(issue.type)}</span>
        </span>
        <span className="issue-node__title">{issue.title}</span>
        <span className="issue-node__state">
          <span aria-hidden="true">
            <StatusMark mark={mark} size={12} />
          </span>
          {vocabulary.issueState(issue.state)}
        </span>
        {node.missingDependencies.length === 0 ? null : (
          <span className="issue-node__missing">{t('issues.graph.waitsForMissing', { issues: numbersList(node.missingDependencies, fmt.list) })}</span>
        )}
      </Link>
      {dependsOn === null ? null : (
        <span id={descriptionId} className="visually-hidden">
          {dependsOn}
        </span>
      )}
    </li>
  );
}
