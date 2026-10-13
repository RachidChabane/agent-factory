import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Pause, Play } from 'lucide-react';
import type { Translate } from '../i18n/create-i18n.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { isDraining } from '../model/actions.ts';
import { paths } from '../model/routes.ts';
import { Avatar } from '../ui/components/Avatar.tsx';
import { AgentGlyph } from '../ui/components/AgentGlyph.tsx';
import { CommandIconButton } from '../widgets/CommandIconButton.tsx';
import { DrainControl } from '../widgets/DrainControl.tsx';
import type { NavigationCounts } from './derived.ts';
import { useNavigationCounts, useProjectSummaries, useSelectedProject } from './derived.ts';
import { useMaybeSnapshot } from './hooks.ts';
import type { CountTone, NavigationAppearance } from './navigation.ts';
import { FACTORY_NAVIGATION, PROJECT_NAVIGATION, WORKSPACE_NAVIGATION } from './navigation.ts';
import { ProjectSwitcher } from './ProjectSwitcher.tsx';

interface NavigationLinkProps {
  readonly item: NavigationAppearance;
  readonly href: string;
  readonly counts: NavigationCounts;
  readonly end: boolean;
  readonly onNavigate: (() => void) | undefined;
}

function NavigationLink({ item, href, counts, end, onNavigate }: NavigationLinkProps) {
  const { t } = useI18n();
  const count = item.count?.(counts) ?? 0;
  const tone: CountTone = item.countTone ?? 'neutral';
  const Icon = item.icon;
  return (
    <li>
      <NavLink to={href} end={end} title={t(item.label)} className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`} onClick={onNavigate}>
        <Icon size={16} aria-hidden="true" />
        <span className="sidebar__label">{t(item.label)}</span>
        {count > 0 ? (
          <span className={`sidebar__count sidebar__count--${tone} num`} aria-label={t('nav.count', { count })}>
            {count}
          </span>
        ) : null}
      </NavLink>
    </li>
  );
}

function NavigationGroup({ title, children }: { readonly title: string | null; readonly children: ReactNode }) {
  return (
    <div className="sidebar__group">
      {title === null ? null : <p className="sidebar__group-title small-caps">{title}</p>}
      <ul>{children}</ul>
    </div>
  );
}

function schedulerState(paused: boolean, draining: boolean, t: Translate): string {
  if (draining) return t('sidebar.schedulerDraining');
  return paused ? t('sidebar.schedulerPaused') : t('sidebar.schedulerRunning');
}

function SchedulerFooter() {
  const { t, fmt } = useI18n();
  const snapshot = useMaybeSnapshot();
  const operator = snapshot?.installation.operator ?? t('sidebar.operator');
  const paused = (snapshot?.installation.pauses.length ?? 0) > 0;
  const operatorPaused = snapshot?.installation.pauses.some((pause) => pause.cause === 'operator') ?? false;
  const draining = isDraining(snapshot?.installation.pauses ?? []);
  const slots = snapshot?.installation.runSlots ?? null;
  return (
    <div className="sidebar__footer">
      <Avatar name={operator} size="md" tone="accent" />
      <span className="sidebar__operator">
        <span className="truncate">{operator}</span>
        <span className={`sidebar__scheduler${paused ? ' is-paused' : ''}`}>{schedulerState(paused, draining, t)}</span>
        {slots === null ? null : (
          <span className="sidebar__slots num">
            {t('sidebar.slots', { running: fmt.integer(slots.running), limit: fmt.integer(slots.limit) })}
            {slots.queued > 0 ? ` · ${t('sidebar.queued', { count: fmt.integer(slots.queued) })}` : ''}
          </span>
        )}
      </span>
      {snapshot === null ? null : <DrainControl appearance="icon" className="sidebar__scheduler-toggle" />}
      {snapshot === null ? null : operatorPaused ? (
        <CommandIconButton command="scheduler.resume" body={{ project: null }} label={t('pause.resumeInstallation')} icon={<Play size={14} />} size="sm" className="sidebar__scheduler-toggle" />
      ) : (
        <CommandIconButton command="scheduler.pause" body={{ project: null }} label={t('pause.pauseInstallation')} icon={<Pause size={14} />} size="sm" className="sidebar__scheduler-toggle" />
      )}
    </div>
  );
}

interface SidebarProps {
  readonly onNavigate?: (() => void) | undefined;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { t } = useI18n();
  const snapshot = useMaybeSnapshot();
  const selected = useSelectedProject();
  const counts = useNavigationCounts(selected);
  const summaries = useProjectSummaries();
  const project = snapshot?.projects.find((candidate) => candidate.id === selected) ?? null;
  return (
    <nav className="sidebar" aria-label={t('nav.main')}>
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          <AgentGlyph size={18} />
        </span>
        <span className="sidebar__brand-text">
          <span className="sidebar__product">{t('common.appName')}</span>
          <span className="sidebar__repository truncate">{snapshot === null ? t('common.loading') : t('sidebar.version', { version: snapshot.installation.version })}</span>
        </span>
      </div>
      {snapshot === null ? null : <ProjectSwitcher onNavigate={onNavigate} />}
      <div className="sidebar__groups">
        <NavigationGroup title={t('nav.group.workspace')}>
          {WORKSPACE_NAVIGATION.map((item) => (
            <NavigationLink key={item.id} item={item} href={item.href(selected)} counts={counts} end={item.id === 'changes'} onNavigate={onNavigate} />
          ))}
        </NavigationGroup>
        {project === null ? (
          summaries.length === 0 ? null : (
            <NavigationGroup title={t('nav.group.projects')}>
              {summaries.map((summary) => (
                <li key={summary.id}>
                  <Link to={paths.project(summary.id)} title={summary.name} className="sidebar__link" onClick={onNavigate}>
                    <span className="sidebar__project-dot" aria-hidden="true" />
                    <span className="sidebar__label">{summary.name}</span>
                    {summary.attention > 0 ? (
                      <span className="sidebar__count sidebar__count--attention num" aria-label={t('nav.count', { count: summary.attention })}>
                        {summary.attention}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </NavigationGroup>
          )
        ) : (
          <NavigationGroup title={project.name}>
            {PROJECT_NAVIGATION.map((item) => (
              <NavigationLink key={item.id} item={item} href={item.href(project.id)} counts={counts} end={item.id === 'overview'} onNavigate={onNavigate} />
            ))}
          </NavigationGroup>
        )}
        <NavigationGroup title={t('nav.group.factory')}>
          {FACTORY_NAVIGATION.map((item) => (
            <NavigationLink key={item.id} item={item} href={item.href(null)} counts={counts} end={false} onNavigate={onNavigate} />
          ))}
        </NavigationGroup>
      </div>
      <SchedulerFooter />
    </nav>
  );
}
