import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Menu, Moon, Search, Sun, WifiOff } from 'lucide-react';
import { VIEW_PATHS, VIEW_TITLES } from '../model/routes.ts';
import { CommandPalette } from '../ui/components/CommandPalette.tsx';
import { IconButton } from '../ui/components/IconButton.tsx';
import { Kbd } from '../ui/components/Kbd.tsx';
import { CONNECTION_STATUS_LABELS } from '../i18n/labels.ts';
import { useCockpitState } from './hooks.ts';
import { GO_TO_PREFIX_KEY, GO_TO_TIMEOUT_MS, NAVIGATION_ITEMS } from './navigation.ts';
import { NotificationCenter } from './NotificationCenter.tsx';
import { usePaletteItems } from './palette-items.tsx';
import { Sidebar } from './Sidebar.tsx';
import { SystemStatus } from './SystemStatus.tsx';
import { useTheme } from './ThemeProvider.tsx';

const PALETTE_KEY = 'k';
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

function currentTitle(pathname: string): string {
  const match = NAVIGATION_ITEMS.filter((item) => item.id !== 'board').find((item) => pathname.startsWith(VIEW_PATHS[item.id]));
  return VIEW_TITLES[match?.id ?? 'board'];
}

function useGlobalShortcuts(openPalette: () => void): void {
  const navigate = useNavigate();
  const pendingGo = useRef<number | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === PALETTE_KEY) {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
      if (pendingGo.current !== null && event.timeStamp - pendingGo.current < GO_TO_TIMEOUT_MS) {
        pendingGo.current = null;
        const target = NAVIGATION_ITEMS.find((item) => item.shortcut === event.key.toLowerCase());
        if (target !== undefined) {
          event.preventDefault();
          void navigate(VIEW_PATHS[target.id]);
        }
        return;
      }
      pendingGo.current = event.key.toLowerCase() === GO_TO_PREFIX_KEY ? event.timeStamp : null;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, openPalette]);
}

function ConnectionBanner() {
  const connection = useCockpitState((state) => state.connection);
  const loadError = useCockpitState((state) => state.loadError);
  const hasSnapshot = useCockpitState((state) => state.snapshot !== null);
  if (connection.status === 'live' || connection.status === 'connecting') return null;
  return (
    <div className={`connection-banner connection-banner--${connection.status}`} role="status">
      <WifiOff size={14} aria-hidden="true" />
      <span>
        {CONNECTION_STATUS_LABELS[connection.status]}
        {hasSnapshot ? ' — les données affichées peuvent être en retard.' : ' — impossible de joindre le serveur de l’usine.'}
      </span>
      {loadError === null ? null : <span className="connection-banner__detail mono truncate">{loadError}</span>}
    </div>
  );
}

export function Shell({ children }: { readonly children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const openPalette = useCallback(() => setPaletteOpen((open) => !open), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const paletteItems = usePaletteItems();
  useGlobalShortcuts(openPalette);
  useEffect(() => setNavigationOpen(false), [location.pathname]);
  return (
    <div className={`shell${navigationOpen ? ' is-navigation-open' : ''}`}>
      <a href="#content" className="skip-link">
        Aller au contenu
      </a>
      <div className="shell__sidebar">
        <Sidebar onNavigate={() => setNavigationOpen(false)} />
      </div>
      <button type="button" className="shell__scrim" aria-label="Fermer la navigation" tabIndex={-1} onClick={() => setNavigationOpen(false)} />
      <div className="shell__main">
        <header className="topbar">
          <IconButton className="topbar__menu" label="Ouvrir la navigation" icon={<Menu size={18} />} onClick={() => setNavigationOpen(true)} />
          <span className="topbar__title">{location.pathname === VIEW_PATHS.board ? null : currentTitle(location.pathname)}</span>
          <button type="button" className="topbar__search" onClick={() => setPaletteOpen(true)} aria-label="Rechercher partout (⌘K)">
            <Search size={15} aria-hidden="true" />
            <span className="topbar__search-text">Rechercher une issue, un run, une PR ou une action…</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="topbar__actions">
            <SystemStatus />
            <IconButton className="topbar__palette" label="Rechercher" icon={<Search size={16} />} onClick={() => setPaletteOpen(true)} />
            <NotificationCenter />
            <IconButton
              label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              onClick={toggle}
            />
          </div>
        </header>
        <ConnectionBanner />
        <main id="content" className="shell__content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} items={paletteItems} />
    </div>
  );
}
