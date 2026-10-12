import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Select } from '../../ui/components/Field.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';

const SEGMENTED_PROJECTS_MAX = 4;
const ALL_PROJECTS = '';

interface ProjectFilterProps {
  /** The project shown, or null for all of them. */
  readonly value: string | null;
  readonly onChange: (project: string | null) => void;
}

/** Chooses between all projects and one: as a segmented control while there are few, as a list when there are many. */
export function ProjectFilter({ value, onChange }: ProjectFilterProps) {
  const { t } = useI18n();
  const { projects } = useSnapshot();
  if (projects.length <= 1) return null;
  if (projects.length > SEGMENTED_PROJECTS_MAX) {
    return (
      <Select aria-label={t('board.filter.project')} value={value ?? ALL_PROJECTS} onChange={(event) => onChange(event.currentTarget.value === ALL_PROJECTS ? null : event.currentTarget.value)}>
        <option value={ALL_PROJECTS}>{t('switcher.all')}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <Segmented
      label={t('board.filter.project')}
      value={value ?? ALL_PROJECTS}
      onChange={(next) => onChange(next === ALL_PROJECTS ? null : next)}
      items={[{ id: ALL_PROJECTS, label: t('switcher.all') }, ...projects.map((project) => ({ id: project.id, label: project.name }))]}
    />
  );
}
