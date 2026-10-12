import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell, BellOff } from 'lucide-react';
import { relativeTime } from '../format/format.ts';
import { ATTENTION_LABELS } from '../model/board.ts';
import { VIEW_PATHS } from '../model/routes.ts';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { IconButton } from '../ui/components/IconButton.tsx';
import { Popover } from '../ui/components/Popover.tsx';
import { StatusMark } from '../ui/components/StatusMark.tsx';
import { useNow } from './context.tsx';
import { useBoard } from './derived.ts';

export function NotificationCenter() {
  const board = useBoard();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const items = board.columns['needs-you'];
  return (
    <span className="notification-anchor">
      <IconButton
        ref={anchor}
        label={items.length === 0 ? 'Notifications' : `Notifications : ${items.length} éléments vous concernent`}
        icon={<Bell size={16} />}
        badge={items.length}
        active={open}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label="Vous concerne" width={380}>
        <div className="notifications">
          <header className="notifications__header">
            <span className="notifications__title">Vous concerne</span>
            <span className="ds-count num">{items.length}</span>
          </header>
          {items.length === 0 ? (
            <EmptyState compact icon={<BellOff size={16} />} title="Rien ne vous attend" description="Les éléments qui demandent votre action apparaîtront ici." />
          ) : (
            <ul className="notifications__list">
              {items.map((card) => (
                <li key={card.key}>
                  <Link to={card.href} className="notifications__item" onClick={() => setOpen(false)}>
                    <StatusMark mark={card.mark} />
                    <span className="notifications__text">
                      <span className="notifications__item-title truncate">
                        <span className="notifications__reference">{card.reference}</span> {card.title}
                      </span>
                      <span className="notifications__item-meta truncate">
                        {card.attention === null ? card.step : ATTENTION_LABELS[card.attention]}
                      </span>
                    </span>
                    <span className="notifications__time num">{relativeTime(card.updatedAt, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <footer className="notifications__footer">
            <Link to={VIEW_PATHS.board} className="link" onClick={() => setOpen(false)}>
              Ouvrir le tableau
            </Link>
          </footer>
        </div>
      </Popover>
    </span>
  );
}
