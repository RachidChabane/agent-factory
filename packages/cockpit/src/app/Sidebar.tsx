import { NavLink } from 'react-router';
import { Pause, Play } from 'lucide-react';
import { VIEW_PATHS, VIEW_TITLES } from '../model/routes.ts';
import { Avatar } from '../ui/components/Avatar.tsx';
import { AgentGlyph } from '../ui/components/AgentGlyph.tsx';
import { useNavigationCounts } from './derived.ts';
import { useCommand, useSnapshot } from './hooks.ts';
import { NAVIGATION } from './navigation.ts';

interface SidebarProps {
  readonly onNavigate?: (() => void) | undefined;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const counts = useNavigationCounts();
  const snapshot = useSnapshot();
  const command = useCommand();
  const paused = snapshot?.factory.schedulerPaused ?? false;
  return (
    <nav className="sidebar" aria-label="Navigation principale">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          <AgentGlyph size={18} />
        </span>
        <span className="sidebar__brand-text">
          <span className="sidebar__product">Usine logicielle</span>
          <span className="sidebar__repository truncate">{snapshot?.factory.repository ?? '…'}</span>
        </span>
      </div>
      <div className="sidebar__groups">
        {NAVIGATION.map((group, index) => (
          <div key={group.title ?? index} className="sidebar__group">
            {group.title === null ? null : <p className="sidebar__group-title small-caps">{group.title}</p>}
            <ul>
              {group.items.map((item) => {
                const count = item.count?.(counts) ?? 0;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <NavLink
                      to={VIEW_PATHS[item.id]}
                      end={item.id === 'board'}
                      className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
                      onClick={onNavigate}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span className="sidebar__label">{VIEW_TITLES[item.id]}</span>
                      {count > 0 ? (
                        <span className={`sidebar__count sidebar__count--${item.countTone ?? 'neutral'} num`} aria-label={`${count} éléments`}>
                          {count}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="sidebar__footer">
        <Avatar name={snapshot?.factory.operator ?? 'Opérateur'} size="md" tone="accent" />
        <span className="sidebar__operator">
          <span className="truncate">{snapshot?.factory.operator ?? '…'}</span>
          <span className={`sidebar__scheduler${paused ? ' is-paused' : ''}`}>{paused ? 'Ordonnanceur en pause' : 'Ordonnanceur actif'}</span>
        </span>
        <button
          type="button"
          className="sidebar__scheduler-toggle"
          aria-label={paused ? 'Reprendre l’ordonnanceur' : 'Mettre l’ordonnanceur en pause'}
          title={paused ? 'Reprendre l’ordonnanceur' : 'Mettre l’ordonnanceur en pause'}
          disabled={snapshot === null || command.pending !== null}
          onClick={() =>
            void (paused
              ? command.run('scheduler.resume', {}, 'Ordonnanceur relancé')
              : command.run('scheduler.pause', {}, 'Ordonnanceur en pause'))
          }
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>
    </nav>
  );
}
