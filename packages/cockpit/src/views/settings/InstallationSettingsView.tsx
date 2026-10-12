import './settings.css';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { ConfigurationFile } from '../../widgets/ConfigurationFile.tsx';
import { CostBasisNote } from '../../widgets/Money.tsx';
import { ToolList } from '../../widgets/ToolList.tsx';
import { BudgetForm } from './BudgetForm.tsx';
import { InstallationFacts } from './InstallationFacts.tsx';
import { NotificationChannels } from './NotificationChannels.tsx';
import { RemoteAccess } from './RemoteAccess.tsx';
import { ResourcesForm } from './ResourcesForm.tsx';
import { RoleEditor } from './RoleEditor.tsx';

const SECTION_IDS = {
  installation: 'installation-settings-installation',
  roles: 'installation-settings-roles',
  resources: 'installation-settings-resources',
  budget: 'installation-settings-budget',
  notifications: 'installation-settings-notifications',
  remoteAccess: 'installation-settings-remote-access',
  tools: 'installation-settings-tools',
  configuration: 'installation-settings-configuration',
} as const;

export function InstallationSettingsView() {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const { settings, installation, costs } = snapshot;
  return (
    <Page width="narrow">
      <PageHeader title={t('nav.settings')} description={t('settings.installation.description')} />
      <CostBasisNote basis={costs.basis} />
      <Section title={t('settings.installation.title')} id={SECTION_IDS.installation}>
        <InstallationFacts installation={installation} />
      </Section>
      <Section title={t('settings.defaultRoles.title')} id={SECTION_IDS.roles} description={t('settings.roles.defaultsDescription')}>
        <RoleEditor project={null} roles={settings.defaultRoles} models={settings.models} />
      </Section>
      <Section title={t('settings.resources.title')} id={SECTION_IDS.resources} description={t('settings.resources.description')}>
        <ResourcesForm setting={settings.resources} />
      </Section>
      <Section title={t('settings.budget.title')} id={SECTION_IDS.budget} description={t('settings.budget.description')}>
        <BudgetForm setting={costs} basis={costs.basis} />
      </Section>
      <Section title={t('settings.notifications.title')} id={SECTION_IDS.notifications} description={t('settings.notifications.description')}>
        <NotificationChannels channels={settings.notifications} />
      </Section>
      <Section title={t('settings.remote.title')} id={SECTION_IDS.remoteAccess}>
        <RemoteAccess access={settings.remoteAccess} />
      </Section>
      <Section title={t('settings.installationTools.title')} id={SECTION_IDS.tools} description={t('settings.installationTools.description')}>
        <ToolList tools={snapshot.tools} project={null} />
      </Section>
      <ConfigurationFile configuration={settings.configuration} />
    </Page>
  );
}
