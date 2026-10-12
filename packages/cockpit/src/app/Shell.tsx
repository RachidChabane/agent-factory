import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { MessageKey } from '../i18n/catalog/index.ts';
import { projectOfPath, sectionOfPath } from '../model/routes.ts';
import { CommandPalette } from '../ui/components/CommandPalette.tsx';
import { IconButton } from '../ui/components/IconButton.tsx';
import { Kbd } from '../ui/components/Kbd.tsx';
import { DrainDialog } from '../widgets/DrainDialog.tsx';
import { ActivityButton } from './ActivityFeed.tsx';
import { ConnectionBanner, ModeBanner } from './Banners.tsx';
import { ConfigurationBanners } from './ConfigurationBanners.tsx';
import { useSelectedProject } from './derived.ts';
import { LanguageSwitch } from './LanguageSwitch.tsx';
import { FACTORY_NAVIGATION, GO_TO_PREFIX_KEY, GO_TO_TIMEOUT_MS, PROJECT_NAVIGATION, SECTION_LABELS, WORKSPACE_NAVIGATION } from './navigation.ts';
import type { NavigationItem } from './navigation.ts';
import { NotificationCenter } from './NotificationCenter.tsx';
import { usePaletteItems } from './palette-items.tsx';
import { Sidebar } from './Sidebar.tsx';
import { SnapshotGate } from './SnapshotGate.tsx';
import { SystemStatus } from './SystemStatus.tsx';
import { useTheme } from './ThemeProvider.tsx';

const PALETTE_KEY = 'k';
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

/** The title shown in the top bar on a narrow screen, where the sidebar is hidden. */
export function pageTitleKey(pathname: string): MessageKey | null {
  if (projectOfPath(pathname) !== null) {
    const section = sectionOfPath(pathname);
    return section === null ? 'nav.overview' : SECTION_LABELS[section];
  }
  if (pathname.startsWith('/runs')) return 'nav.runs';
  if (pathname.startsWith('/usage')) return 'nav.usage';
  if (pathname.startsWith('/settings')) return 'nav.settings';
  return null;
}

function shortcutTarget(key: string, project: string | null): string | null {
  const global: readonly NavigationItem[] = [...WORKSPACE_NAVIGATION, ...FACTORY_NAVIGATION];
  const globalItem = global.find((item) => item.shortcut === key);
  if (globalItem !== undefined) return globalItem.href(project);
  if (project === null) return null;
  return PROJECT_NAVIGATION.find((item) => item.shortcut === key)?.href(project) ?? null;
}

function useGlobalShortcuts(openPalette: () => void): void {
  const navigate = useNavigate();
  const project = useSelectedProject();
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
        const target = shortcutTarget(event.key.toLowerCase(), project);
        if (target !== null) {
          event.preventDefault();
          void navigate(target);
        }
        return;
      }
      pendingGo.current = event.key.toLowerCase() === GO_TO_PREFIX_KEY ? event.timeStamp : null;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, openPalette, project]);
}

export function Shell({ children }: { readonly children: ReactNode }) {
  const { t } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const openPalette = useCallback(() => setPaletteOpen((open) => !open), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const [drainOpen, setDrainOpen] = useState(false);
  const askDrain = useCallback(() => setDrainOpen(true), []);
  const paletteItems = usePaletteItems(askDrain);
  const titleKey = pageTitleKey(location.pathname);
  useGlobalShortcuts(openPalette);
  useEffect(() => setNavigationOpen(false), [location.pathname]);
  return (
    <div className={`shell${navigationOpen ? ' is-navigation-open' : ''}`}>
      <a href="#content" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <div className="shell__sidebar">
        <Sidebar onNavigate={() => setNavigationOpen(false)} />
      </div>
      <button type="button" className="shell__scrim" aria-label={t('nav.close')} tabIndex={-1} onClick={() => setNavigationOpen(false)} />
      <div className="shell__main">
        <ModeBanner />
        <header className="topbar">
          <IconButton className="topbar__menu" label={t('nav.open')} icon={<Menu size={18} />} onClick={() => setNavigationOpen(true)} />
          <span className="topbar__title">{titleKey === null ? null : t(titleKey)}</span>
          <button type="button" className="topbar__search" onClick={() => setPaletteOpen(true)} aria-label={t('topbar.search')}>
            <Search size={15} aria-hidden="true" />
            <span className="topbar__search-text">{t('topbar.searchText')}</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="topbar__actions">
            <SystemStatus />
            <IconButton className="topbar__palette" label={t('topbar.searchShort')} icon={<Search size={16} />} onClick={() => setPaletteOpen(true)} />
            <ActivityButton />
            <NotificationCenter />
            <LanguageSwitch />
            <IconButton
              label={theme === 'dark' ? t('topbar.theme.toLight') : t('topbar.theme.toDark')}
              icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              onClick={toggle}
            />
          </div>
        </header>
        <ConnectionBanner />
        <ConfigurationBanners />
        <main id="content" className="shell__content" tabIndex={-1}>
          <SnapshotGate>{children}</SnapshotGate>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} items={paletteItems} />
      <DrainDialog open={drainOpen} onClose={() => setDrainOpen(false)} />
    </div>
  );
}
