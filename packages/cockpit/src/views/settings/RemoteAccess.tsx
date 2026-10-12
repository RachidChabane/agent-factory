import type { InstallationSettingsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Card } from '../../ui/components/Card.tsx';

/** How the cockpit can be reached from other machines, and what that means. */
export function RemoteAccess({ access }: { readonly access: InstallationSettingsView['remoteAccess'] }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <Card className="remote-access">
      <p className="remote-access__kind">{vocabulary.remoteAccess(access)}</p>
      <p className="remote-access__meaning">{t(`settings.remote.${access}`)}</p>
    </Card>
  );
}
