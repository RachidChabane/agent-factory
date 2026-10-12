import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { History } from 'lucide-react';
import type { StreamEvent } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { subjectHref } from '../model/activity.ts';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { IconButton } from '../ui/components/IconButton.tsx';
import { Popover } from '../ui/components/Popover.tsx';
import { ProjectTag } from '../widgets/ProjectTag.tsx';
import { Time } from '../widgets/Time.tsx';
import { useCockpitState } from './hooks.ts';

const POPOVER_EVENTS = 30;

/** One event of the factory's log: when, in which project, and what happened, with a link to the subject when it has a page. */
export function ActivityItem({ event }: { readonly event: StreamEvent }) {
  const { t } = useI18n();
  const href = subjectHref(event.project, event.subject);
  const body = (
    <>
      <span className="activity-item__summary">{event.summary}</span>
      <span className="activity-item__meta">
        {event.project === null ? <span className="project-tag">{t('activity.installation')}</span> : <ProjectTag project={event.project} />}
        <Time iso={event.occurredAt} className="num" />
        <span className="mono truncate">{event.type}</span>
      </span>
    </>
  );
  return (
    <li>
      {href === null ? (
        <div className="activity-item">{body}</div>
      ) : (
        <Link to={href} className="activity-item activity-item--link" aria-label={`${event.summary} — ${t('activity.subject', { subject: event.subject })}`}>
          {body}
        </Link>
      )}
    </li>
  );
}

/** The events of the factory, newest first; `project` narrows them to one project's. */
export function ActivityList({ project, limit }: { readonly project?: string | null | undefined; readonly limit: number }) {
  const { t } = useI18n();
  const activity = useCockpitState((state) => state.activity);
  const events = activity.filter((event) => project === undefined || project === null || event.project === project).slice(0, limit);
  if (events.length === 0) return <EmptyState compact icon={<History size={16} />} title={t('activity.empty')} description={t('activity.emptyHint')} />;
  return (
    <ul className="activity-list">
      {events.map((event) => (
        <ActivityItem key={event.sequence} event={event} />
      ))}
    </ul>
  );
}

export function ActivityButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <span className="notification-anchor topbar__optional">
      <IconButton
        ref={anchor}
        label={t('activity.label')}
        icon={<History size={16} />}
        active={open}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label={t('activity.title')} width={420}>
        <div className="notifications">
          <header className="notifications__header">
            <span className="notifications__title">{t('activity.title')}</span>
          </header>
          <div className="activity-popover">
            <ActivityList limit={POPOVER_EVENTS} />
          </div>
        </div>
      </Popover>
    </span>
  );
}
