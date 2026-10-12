import type { ProjectSettingsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { Card, PropertyList } from '../../ui/components/Card.tsx';

/** Whether the project's pull requests are filmed, in which time zone the expected arrivals are told, and how long a recording may take. */
export function ProjectFilms({ films }: { readonly films: ProjectSettingsView['films'] }) {
  const { t, fmt } = useI18n();
  if (films === null) {
    return (
      <Card>
        <p className="subtle">{t('settings.films.none')}</p>
      </Card>
    );
  }
  return (
    <Card>
      <PropertyList
        items={[
          { label: t('settings.films.timeZone'), value: <code>{films.timeZone}</code> },
          { label: t('settings.films.timeout'), value: fmt.duration(films.timeoutMinutes * MINUTE_MS) },
        ]}
      />
    </Card>
  );
}
