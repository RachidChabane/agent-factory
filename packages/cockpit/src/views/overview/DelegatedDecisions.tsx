import type { ProjectView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card, Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { DelegatedDecisionList } from '../../widgets/DelegatedDecisionList.tsx';
import { AutonomyPolicySummary } from './AutonomyPolicySummary.tsx';

const SECTION_ID = 'overview-delegated';

/** What the project's orchestrator decided in the operator's place, newest first, under what the project delegates. */
export function DelegatedDecisions({ project }: { readonly project: ProjectView }) {
  const { t } = useI18n();
  const { autonomy } = project.settings;
  return (
    <Section title={t('autonomy.title')} id={SECTION_ID} description={t('autonomy.description', { actor: autonomy.actor })}>
      <AutonomyPolicySummary autonomy={autonomy} />
      {project.delegatedDecisions.length === 0 ? (
        <EmptyState compact title={t('autonomy.none')} description={t('autonomy.noneDescription')} />
      ) : (
        <Card padded={false}>
          <DelegatedDecisionList project={project.id} decisions={project.delegatedDecisions} label={t('autonomy.list')} />
        </Card>
      )}
    </Section>
  );
}
