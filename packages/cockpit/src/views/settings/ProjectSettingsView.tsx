import './settings.css';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { CostBasisNote } from '../../widgets/Money.tsx';
import { ToolList } from '../../widgets/ToolList.tsx';
import { AutomationList } from './AutomationList.tsx';
import { ConcurrencyForm } from './ConcurrencyForm.tsx';
import { IssueTypeList } from './IssueTypeList.tsx';
import { GateCommands, SetupCommands } from './ProjectCommands.tsx';
import { EnvironmentVariables, ProjectConventions } from './ProjectConventions.tsx';
import { ProjectFilms } from './ProjectFilms.tsx';
import { RoleEditor } from './RoleEditor.tsx';

const SECTION_IDS = {
  roles: 'project-settings-roles',
  concurrency: 'project-settings-concurrency',
  setup: 'project-settings-setup',
  gate: 'project-settings-gate',
  environment: 'project-settings-environment',
  films: 'project-settings-films',
  conventions: 'project-settings-conventions',
  automations: 'project-settings-automations',
  issueTypes: 'project-settings-issue-types',
  tools: 'project-settings-tools',
} as const;

export function ProjectSettingsView() {
  const { t } = useI18n();
  const project = useProject();
  const snapshot = useSnapshot();
  const { settings } = project;
  return (
    <Page key={project.id} width="narrow">
      <PageHeader title={t('nav.projectSettings')} description={t('settings.project.description', { project: project.name })} />
      <CostBasisNote basis={snapshot.costs.basis} />
      <Section title={t('settings.roles.title')} id={SECTION_IDS.roles} description={t('settings.roles.projectDescription', { project: project.name })}>
        <RoleEditor project={project.id} roles={settings.roles} models={snapshot.settings.models} overriddenPrompts={settings.overriddenPrompts} />
      </Section>
      <Section title={t('settings.concurrency.title')} id={SECTION_IDS.concurrency} description={t('settings.concurrency.description', { project: project.name })}>
        <ConcurrencyForm project={project.id} setting={settings.concurrency} />
      </Section>
      <Section title={t('settings.setup.title')} id={SECTION_IDS.setup} description={t('settings.setup.description')}>
        <SetupCommands commands={settings.setup} />
      </Section>
      <Section title={t('settings.gate.title')} id={SECTION_IDS.gate} description={t('settings.gate.description')}>
        <GateCommands gate={settings.gate} />
      </Section>
      <Section title={t('settings.environment.title')} id={SECTION_IDS.environment} description={t('settings.environment.description')}>
        <EnvironmentVariables names={settings.environmentVariables} />
      </Section>
      <Section title={t('settings.films.title')} id={SECTION_IDS.films} description={t('settings.films.description')}>
        <ProjectFilms films={settings.films} />
      </Section>
      <Section title={t('settings.conventions.title')} id={SECTION_IDS.conventions}>
        <ProjectConventions settings={settings} />
      </Section>
      <Section title={t('settings.automations.title')} id={SECTION_IDS.automations} description={t('settings.automations.description')}>
        <AutomationList automations={settings.automations} />
      </Section>
      <Section title={t('settings.issueTypes.title')} id={SECTION_IDS.issueTypes} description={t('settings.issueTypes.description')}>
        <IssueTypeList types={project.issueTypes} />
      </Section>
      <Section title={t('settings.projectTools.title')} id={SECTION_IDS.tools} description={t('settings.projectTools.description')}>
        <ToolList tools={project.tools} project={project.id} />
      </Section>
    </Page>
  );
}
