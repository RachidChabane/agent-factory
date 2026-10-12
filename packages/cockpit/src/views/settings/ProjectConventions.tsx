import type { ProjectSettingsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card, PropertyList } from '../../ui/components/Card.tsx';

/** The labels and the branch prefix the factory marks its work with, and how the project names its releases. */
export function ProjectConventions({ settings }: { readonly settings: ProjectSettingsView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <Card>
      <PropertyList
        items={[
          { label: t('settings.conventions.factoryLabel'), value: <code>{settings.labels.factory}</code> },
          { label: t('settings.conventions.validatedLabel'), value: <code>{settings.labels.validated}</code> },
          { label: t('settings.conventions.auditLabel'), value: <code>{settings.labels.audit}</code> },
          { label: t('settings.conventions.kindPrefix'), value: <code>{settings.labels.kindPrefix}</code> },
          { label: t('settings.conventions.branchPrefix'), value: <code>{settings.branchPrefix}</code> },
          { label: t('settings.conventions.releaseModel'), value: vocabulary.releaseModel(settings.releaseModel) },
        ]}
      />
    </Card>
  );
}

/** The names of the variables the check commands receive: their values stay on the machine. */
export function EnvironmentVariables({ names }: { readonly names: ProjectSettingsView['environmentVariables'] }) {
  const { t } = useI18n();
  return (
    <Card className="environment-variables">
      {names.length === 0 ? (
        <p className="subtle">{t('settings.environment.empty')}</p>
      ) : (
        <ul className="environment-variables__names" aria-label={t('settings.environment.title')}>
          {names.map((name) => (
            <li key={name}>
              <Badge mono>{name}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
