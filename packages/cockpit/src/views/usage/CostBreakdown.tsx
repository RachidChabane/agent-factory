import { Link } from 'react-router';
import { useSnapshot } from '../../app/hooks.ts';
import type { CostEntry, CostsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { findProject } from '../../model/projects.ts';
import { paths } from '../../model/routes.ts';
import { Section } from '../../ui/components/Card.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import { ProjectTag } from '../../widgets/ProjectTag.tsx';
import { BreakdownCard } from './BreakdownCard.tsx';
import { roleOfKey } from './costs-model.ts';

type IssueCostEntry = CostsView['byIssue'][number];

function ProjectLabel({ entry }: { readonly entry: CostEntry }) {
  const project = findProject(useSnapshot(), entry.key);
  return project === null ? (
    <span className="usage-entry__name">{entry.key}</span>
  ) : (
    <Link to={paths.project(project.id)} className="usage-entry__name usage-entry__link">
      {project.name}
    </Link>
  );
}

function RoleLabel({ entry }: { readonly entry: CostEntry }) {
  const role = roleOfKey(entry.key);
  return role === null ? <span className="usage-entry__name">{entry.key}</span> : <RoleGlyph role={role} labelled />;
}

function IssueLabel({ entry }: { readonly entry: IssueCostEntry }) {
  const { t } = useI18n();
  const project = findProject(useSnapshot(), entry.project);
  const issue = project?.issues.find((candidate) => candidate.number === entry.issueNumber);
  const reference = `#${entry.issueNumber}`;
  return (
    <>
      {project === null || issue === undefined ? (
        <span className="usage-entry__name num">{reference}</span>
      ) : (
        <Link to={paths.issue(project.id, issue.number)} className="usage-entry__name usage-entry__link num" aria-label={t('usage.breakdown.issueLink', { number: issue.number, project: project.name })}>
          {reference}
        </Link>
      )}
      {issue === undefined ? null : <span className="usage-entry__title truncate">{issue.title}</span>}
      <ProjectTag project={entry.project} />
    </>
  );
}

/** The cost of every recorded run, grouped by project, role, model and issue. */
export function CostBreakdown({ costs }: { readonly costs: CostsView }) {
  const { t } = useI18n();
  return (
    <Section id="usage-breakdown" title={t('usage.breakdown.title')} description={t('usage.breakdown.description')}>
      <div className="usage-breakdowns">
        <BreakdownCard title={t('usage.breakdown.byProject')} entries={costs.byProject} basis={costs.basis} renderLabel={(entry) => <ProjectLabel entry={entry} />} />
        <BreakdownCard title={t('usage.breakdown.byRole')} entries={costs.byRole} basis={costs.basis} renderLabel={(entry) => <RoleLabel entry={entry} />} />
        <BreakdownCard title={t('usage.breakdown.byModel')} entries={costs.byModel} basis={costs.basis} renderLabel={(entry) => <span className="usage-entry__name mono">{entry.key}</span>} />
        <BreakdownCard title={t('usage.breakdown.byIssue')} entries={costs.byIssue} basis={costs.basis} renderLabel={(entry) => <IssueLabel entry={entry} />} />
      </div>
    </Section>
  );
}
