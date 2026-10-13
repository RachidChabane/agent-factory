import type { FilmToolWaitView, ProjectSettingsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { Card, PropertyList } from '../../ui/components/Card.tsx';
import { CodeList } from '../../widgets/CodeList.tsx';
import { FilmToolWaitNotice } from '../../widgets/FilmToolWaitNotice.tsx';

interface ProjectFilmsProps {
  readonly project: string;
  readonly films: ProjectSettingsView['films'];
  /** The tool the project's films wait for now, if any. */
  readonly wait: FilmToolWaitView | null;
}

/**
 * Whether the project's pull requests are filmed, in which time zone the expected arrivals are told, how long a recording
 * may take, which tools must pass their checks before a film starts, and the tool the films wait for now.
 */
export function ProjectFilms({ project, films, wait }: ProjectFilmsProps) {
  const { t, fmt } = useI18n();
  if (films === null) {
    return (
      <Card>
        <p className="subtle">{t('settings.films.none')}</p>
      </Card>
    );
  }
  return (
    <>
      <Card>
        <PropertyList
          items={[
            { label: t('settings.films.timeZone'), value: <code>{films.timeZone}</code> },
            { label: t('settings.films.timeout'), value: fmt.duration(films.timeoutMinutes * MINUTE_MS) },
            {
              label: t('settings.films.tools'),
              value: films.tools.length === 0 ? <span className="subtle">{t('settings.films.toolsNone')}</span> : <CodeList items={films.tools} />,
            },
          ]}
        />
      </Card>
      {wait === null ? null : <FilmToolWaitNotice wait={wait} project={project} />}
    </>
  );
}
