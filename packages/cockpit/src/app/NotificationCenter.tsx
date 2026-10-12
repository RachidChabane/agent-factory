import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell, BellOff } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { paths } from '../model/routes.ts';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { IconButton } from '../ui/components/IconButton.tsx';
import { Popover } from '../ui/components/Popover.tsx';
import { ProjectTag } from '../widgets/ProjectTag.tsx';
import { Time } from '../widgets/Time.tsx';
import { useAttention } from './derived.ts';

export function NotificationCenter() {
  const { t } = useI18n();
  const items = useAttention(null);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <span className="notification-anchor">
      <IconButton
        ref={anchor}
        label={items.length === 0 ? t('notifications.label') : t('notifications.withCount', { count: items.length })}
        icon={<Bell size={16} />}
        badge={items.length}
        active={open}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label={t('notifications.title')} width={400}>
        <div className="notifications">
          <header className="notifications__header">
            <span className="notifications__title">{t('notifications.title')}</span>
            <span className="ds-count num">{items.length}</span>
          </header>
          {items.length === 0 ? (
            <EmptyState compact icon={<BellOff size={16} />} title={t('notifications.empty')} description={t('notifications.emptyHint')} />
          ) : (
            <ul className="notifications__list">
              {items.map((item) => (
                <li key={item.key}>
                  <Link to={item.href} className="notifications__item" onClick={() => setOpen(false)}>
                    <span className="notifications__text">
                      <span className="notifications__item-title truncate">
                        <span className="notifications__reference">{item.reference}</span> {item.title}
                      </span>
                      <span className="notifications__item-meta truncate">
                        {t(`attention.${item.kind}`)}
                        {item.project === null ? null : (
                          <>
                            {' · '}
                            <ProjectTag project={item.project} />
                          </>
                        )}
                      </span>
                    </span>
                    <Time iso={item.at} className="notifications__time num" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <footer className="notifications__footer">
            <Link to={paths.board()} className="link" onClick={() => setOpen(false)}>
              {t('notifications.openBoard')}
            </Link>
          </footer>
        </div>
      </Popover>
    </span>
  );
}
