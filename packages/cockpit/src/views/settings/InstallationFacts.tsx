import type { InstallationInfo } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Card, PropertyList, Stat } from '../../ui/components/Card.tsx';
import { Time } from '../../widgets/Time.tsx';

function StartedAt({ startedAt }: { readonly startedAt: string | null }) {
  const { t } = useI18n();
  if (startedAt === null) return <span className="subtle">{t('settings.installation.startedUnknown')}</span>;
  return (
    <>
      <Time iso={startedAt} mode="dateTime" /> <span className="subtle">(<Time iso={startedAt} />)</span>
    </>
  );
}

/** What runs: the version, the mode, who operates it, where it answers and how many run slots it holds. */
export function InstallationFacts({ installation }: { readonly installation: InstallationInfo }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const { runSlots } = installation;
  return (
    <div className="installation-facts">
      <Card>
        <PropertyList
          items={[
            { label: t('settings.installation.version'), value: <span className="mono">{installation.version}</span> },
            { label: t('settings.installation.mode'), value: vocabulary.installationMode(installation.mode) },
            { label: t('settings.installation.operator'), value: installation.operator },
            {
              label: t('settings.installation.publicUrl'),
              value: (
                <a className="link" href={installation.publicUrl} target="_blank" rel="noreferrer">
                  {installation.publicUrl}
                </a>
              ),
            },
            { label: t('settings.installation.startedAt'), value: <StartedAt startedAt={installation.startedAt} /> },
          ]}
        />
      </Card>
      <ul className="slot-stats" aria-label={t('settings.installation.slots')}>
        <li>
          <Card>
            <Stat label={t('settings.installation.slotsLimit')} value={runSlots.limit} />
          </Card>
        </li>
        <li>
          <Card>
            <Stat label={t('settings.installation.slotsRunning')} value={runSlots.running} />
          </Card>
        </li>
        <li>
          <Card>
            <Stat label={t('settings.installation.slotsQueued')} value={runSlots.queued} />
          </Card>
        </li>
      </ul>
    </div>
  );
}
