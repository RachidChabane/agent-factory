import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Check, ChevronsUpDown, Layers, Pause } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { ProjectSection } from '../model/routes.ts';
import { paths, sectionOfPath } from '../model/routes.ts';
import { Popover } from '../ui/components/Popover.tsx';
import type { ProjectSummary } from './derived.ts';
import { useProjectSummaries, useSelectedProject } from './derived.ts';

/**
 * Where choosing a project leads: the same section of the new project when the operator is on a
 * project page, the run list of the new project on the run list, and its overview elsewhere.
 */
export function projectTarget(project: string | null, pathname: string): string {
  const section: ProjectSection | null = sectionOfPath(pathname);
  if (project === null) return pathname.startsWith('/runs') ? paths.runs() : paths.board();
  if (pathname.startsWith('/runs')) return paths.runs(project);
  return section === null ? paths.project(project) : paths.section(project, section);
}

function Summary({ summary }: { readonly summary: ProjectSummary }) {
  const { t } = useI18n();
  const parts = [
    summary.attention > 0 ? t('switcher.needYou', { count: summary.attention }) : null,
    summary.liveRuns > 0 ? t('switcher.live', { count: summary.liveRuns }) : null,
    summary.paused ? t('switcher.paused') : null,
  ].filter((part): part is string => part !== null);
  return <span className="project-switcher__summary truncate">{parts.length === 0 ? t('switcher.quiet') : parts.join(' · ')}</span>;
}

interface ProjectSwitcherProps {
  readonly onNavigate?: (() => void) | undefined;
}

export function ProjectSwitcher({ onNavigate }: ProjectSwitcherProps) {
  const { t } = useI18n();
  const location = useLocation();
  const selected = useSelectedProject();
  const summaries = useProjectSummaries();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const current = summaries.find((summary) => summary.id === selected) ?? null;
  const close = () => {
    setOpen(false);
    onNavigate?.();
  };
  return (
    <div className="project-switcher">
      <button
        ref={anchor}
        type="button"
        className="project-switcher__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('switcher.buttonLabel', { name: current?.name ?? t('switcher.all') })}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="project-switcher__icon" aria-hidden="true">
          <Layers size={14} />
        </span>
        <span className="project-switcher__text">
          <span className="project-switcher__name truncate">{current?.name ?? t('switcher.all')}</span>
          {current === null ? (
            <span className="project-switcher__summary truncate">{t('switcher.projectCount', { count: summaries.length })}</span>
          ) : (
            <Summary summary={current} />
          )}
        </span>
        <ChevronsUpDown size={14} aria-hidden="true" className="project-switcher__chevron" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label={t('switcher.choose')} align="start" className="project-switcher__popover">
        <ul className="project-switcher__list" aria-label={t('switcher.listLabel')}>
          <li>
            <Link
              to={projectTarget(null, location.pathname)}
              className={`project-switcher__option${selected === null ? ' is-selected' : ''}`}
              aria-current={selected === null ? 'true' : undefined}
              onClick={close}
            >
              <span className="project-switcher__option-text">
                <span className="project-switcher__name truncate">{t('switcher.all')}</span>
                <span className="project-switcher__summary truncate">{t('switcher.projectCount', { count: summaries.length })}</span>
              </span>
              {selected === null ? <Check size={14} aria-hidden="true" /> : null}
            </Link>
          </li>
          {summaries.map((summary) => (
            <li key={summary.id}>
              <Link
                to={projectTarget(summary.id, location.pathname)}
                className={`project-switcher__option${selected === summary.id ? ' is-selected' : ''}`}
                aria-current={selected === summary.id ? 'true' : undefined}
                onClick={close}
              >
                <span className="project-switcher__option-text">
                  <span className="project-switcher__name truncate">{summary.name}</span>
                  <Summary summary={summary} />
                </span>
                {summary.paused ? <Pause size={13} aria-hidden="true" className="project-switcher__paused" /> : null}
                {selected === summary.id ? <Check size={14} aria-hidden="true" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}
