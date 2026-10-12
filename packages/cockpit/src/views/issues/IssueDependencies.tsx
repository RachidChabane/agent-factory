import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { issueMark } from '../../model/status.ts';
import { Section } from '../../ui/components/Card.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { IssueCycleNotice } from './IssueCycleNotice.tsx';
import { cycleOf, dependenciesOf, dependencyCycles, dependentsOf, isMerged } from './issue-model.ts';

function IssueRow({ issue }: { readonly issue: IssueView }) {
  const vocabulary = useVocabulary();
  const project = useProject();
  return (
    <li>
      <Link to={paths.issue(project.id, issue.number)} className="issue-deps__item">
        <span aria-hidden="true">
          <StatusMark mark={issueMark(issue.state)} size={14} />
        </span>
        <span className="num subtle">#{issue.number}</span>
        <span className="truncate">{issue.title}</span>
        <span className="issue-deps__state">{vocabulary.issueState(issue.state)}</span>
      </Link>
    </li>
  );
}

function Group({ title, empty, isEmpty, children }: { readonly title: string; readonly empty: string; readonly isEmpty: boolean; readonly children: ReactNode }) {
  return (
    <div className="issue-deps__group">
      <p className="small-caps">{title}</p>
      {isEmpty ? <p className="subtle issue-deps__none">{empty}</p> : <ul className="issue-deps__list">{children}</ul>}
    </div>
  );
}

export function IssueDependencies({ issue }: { readonly issue: IssueView }) {
  const { t } = useI18n();
  const project = useProject();
  const { held, missing } = dependenciesOf(issue, project.issues);
  const dependents = dependentsOf(issue, project.issues);
  const unmerged = held.filter((dependency) => !isMerged(dependency));
  const cycle = cycleOf(issue, dependencyCycles(project.issues));
  return (
    <Section title={t('issues.deps.title')} id="issue-dependencies">
      <div className="issue-deps">
        {unmerged.length === 0 ? null : <p className="issue-deps__summary">{t('issues.deps.unmerged', { count: unmerged.length })}</p>}
        {cycle === null ? null : <IssueCycleNotice cycles={[cycle]} />}
        <Group title={t('issues.deps.waitsFor')} empty={t('issues.deps.noUpstream')} isEmpty={held.length === 0 && missing.length === 0}>
          {held.map((dependency) => (
            <IssueRow key={dependency.number} issue={dependency} />
          ))}
          {missing.map((number) => (
            <li key={number} className="issue-deps__missing">
              <span className="num subtle">#{number}</span>
              <span>{t('issues.deps.missing')}</span>
            </li>
          ))}
        </Group>
        <Group title={t('issues.deps.blocks')} empty={t('issues.deps.noDownstream')} isEmpty={dependents.length === 0}>
          {dependents.map((dependent) => (
            <IssueRow key={dependent.number} issue={dependent} />
          ))}
        </Group>
      </div>
    </Section>
  );
}
