import { Search } from 'lucide-react';
import type { ProjectView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Field, Select, TextInput } from '../../ui/components/Field.tsx';

const ALL_PROJECTS = '';
const ICON_SIZE = 14;

interface RunFiltersProps {
  readonly projects: readonly Pick<ProjectView, 'id' | 'name'>[];
  /** The project the list is narrowed to, or null for every project. */
  readonly project: string | null;
  readonly onProject: (project: string | null) => void;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly shown: number;
  readonly total: number;
  readonly filtering: boolean;
  readonly onClear: () => void;
}

/** What narrows the list of runs: a project, when there are several, and words from the role, the subject or the model. */
export function RunFilters({ projects, project, onProject, query, onQuery, shown, total, filtering, onClear }: RunFiltersProps) {
  const { t } = useI18n();
  return (
    <div className="run-filters">
      {projects.length > 1 ? (
        <Field label={t('runs.filter.project')} hideLabel>
          {(id) => (
            <Select id={id} value={project ?? ALL_PROJECTS} onChange={(event) => onProject(event.currentTarget.value === ALL_PROJECTS ? null : event.currentTarget.value)}>
              <option value={ALL_PROJECTS}>{t('switcher.all')}</option>
              {projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Field label={t('runs.filter.search')} hideLabel>
        {(id) => (
          <span className="run-filters__search">
            <Search size={ICON_SIZE} aria-hidden="true" />
            <TextInput id={id} type="search" value={query} placeholder={t('runs.filter.placeholder')} onChange={(event) => onQuery(event.currentTarget.value)} />
          </span>
        )}
      </Field>
      <div className="run-filters__summary">
        <p className="run-filters__result subtle num" role="status">
          {t('runs.filter.result', { shown, count: total })}
        </p>
        {filtering ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            {t('runs.filter.clear')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
