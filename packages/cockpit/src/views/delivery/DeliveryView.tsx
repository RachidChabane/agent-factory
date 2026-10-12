import './delivery.css';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { EnvironmentCard } from './EnvironmentCard.tsx';
import { WorkflowRuns } from './WorkflowRuns.tsx';

const ENVIRONMENTS_SECTION_ID = 'delivery-environments';
const WORKFLOWS_SECTION_ID = 'delivery-workflows';

export function DeliveryView() {
  const { t } = useI18n();
  const project = useProject();
  return (
    <Page key={project.id}>
      <PageHeader title={t('nav.delivery')} description={t('delivery.description', { project: project.name })} />
      <Section title={t('delivery.environments.title')} id={ENVIRONMENTS_SECTION_ID}>
        {project.environments.length === 0 ? (
          <EmptyState compact title={t('delivery.environments.empty')} />
        ) : (
          <div className="delivery-environments">
            {project.environments.map((environment) => (
              <EnvironmentCard key={environment.name} environment={environment} />
            ))}
          </div>
        )}
      </Section>
      <Section title={t('delivery.workflows.title')} id={WORKFLOWS_SECTION_ID}>
        <WorkflowRuns workflows={project.workflows} />
      </Section>
    </Page>
  );
}
