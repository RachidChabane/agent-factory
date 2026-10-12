import type { InstallationSettingsView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Badge } from '../ui/components/Badge.tsx';
import { Card, PropertyList, Section } from '../ui/components/Card.tsx';
import { CopyButton } from '../ui/components/CopyButton.tsx';
import { Time } from './Time.tsx';

export type ConfigurationState = InstallationSettingsView['configuration'];

interface ConfigurationFileProps {
  readonly configuration: ConfigurationState;
}

function PendingRestart({ sections }: { readonly sections: readonly string[] }) {
  const { t } = useI18n();
  if (sections.length === 0) return <span>{t('configuration.restart.none')}</span>;
  return (
    <div className="configuration-file__pending">
      <p className="subtle">{t('configuration.restart.hint')}</p>
      <ul className="configuration-file__sections">
        {sections.map((section) => (
          <li key={section}>
            <code className="mono">{section}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LastReload({ failure }: { readonly failure: ConfigurationState['reloadFailure'] }) {
  const { t, rich } = useI18n();
  if (failure === null) return <span>{t('configuration.reload.notRefused')}</span>;
  return (
    <div className="configuration-file__refusal">
      <Badge tone="failed">{rich('configuration.reload.refused', { when: <Time iso={failure.at} mode="dateTime" />, age: <Time iso={failure.at} /> })}</Badge>
      <p>
        <span className="subtle">{t('configuration.reload.reason')}</span> <span className="mono configuration-file__reason">{failure.reason}</span>
      </p>
      <p>{t('configuration.reload.keptPrevious')}</p>
    </div>
  );
}

/** Where the factory reads its settings from, what waits for a restart, and why a hand edit was refused. */
export function ConfigurationFile({ configuration }: ConfigurationFileProps) {
  const { t } = useI18n();
  return (
    <Section title={t('configuration.heading')} id="configuration-file">
      <Card>
        <PropertyList
          items={[
            {
              label: t('configuration.path'),
              value: (
                <span className="configuration-file__path">
                  <code className="mono">{configuration.path}</code>
                  <CopyButton text={configuration.path} label={t('configuration.copyPath')} />
                </span>
              ),
            },
            { label: t('configuration.restart.heading'), value: <PendingRestart sections={configuration.restartRequired} /> },
            { label: t('configuration.reload.heading'), value: <LastReload failure={configuration.reloadFailure} /> },
          ]}
        />
      </Card>
    </Section>
  );
}
