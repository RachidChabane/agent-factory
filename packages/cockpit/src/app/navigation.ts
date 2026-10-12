import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CircleDot,
  Coins,
  GitPullRequest,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Rocket,
  Settings,
  SlidersHorizontal,
  SquareTerminal,
  Truck,
  ShieldAlert,
} from 'lucide-react';
import type { MessageKey } from '../i18n/catalog/index.ts';
import type { ProjectSection } from '../model/routes.ts';
import { paths } from '../model/routes.ts';
import type { NavigationCounts } from './derived.ts';

export type CountTone = 'attention' | 'live' | 'neutral';

interface NavigationItemBase<Context> {
  readonly id: string;
  readonly icon: LucideIcon;
  /** The key pressed after `g` to go there. */
  readonly shortcut: string;
  readonly label: MessageKey;
  readonly count?: ((counts: NavigationCounts) => number) | undefined;
  readonly countTone?: CountTone | undefined;
  /** The address of the page, given the project in context. */
  readonly href: (project: Context) => string;
}

/** A page of the workspace or of the factory, which can carry the project in context as a filter. */
export type NavigationItem = NavigationItemBase<string | null>;
/** A page of one project. */
export type ProjectNavigationItem = NavigationItemBase<string>;
/** What the sidebar needs to draw an entry, whatever its address depends on. */
export type NavigationAppearance = Pick<NavigationItemBase<never>, 'icon' | 'label' | 'count' | 'countTone'>;

export const WORKSPACE_NAVIGATION: readonly NavigationItem[] = [
  { id: 'board', icon: LayoutGrid, shortcut: 'b', label: 'nav.board', count: (counts) => counts.attention, countTone: 'attention', href: (project) => paths.board(project) },
  { id: 'runs', icon: SquareTerminal, shortcut: 'r', label: 'nav.runs', count: (counts) => counts.liveRuns, countTone: 'live', href: (project) => paths.runs(project) },
];

export const SECTION_LABELS: Readonly<Record<ProjectSection, MessageKey>> = {
  requests: 'nav.requests',
  issues: 'nav.issues',
  'pull-requests': 'nav.pullRequests',
  delivery: 'nav.delivery',
  releases: 'nav.releases',
  audits: 'nav.audits',
  knowledge: 'nav.knowledge',
  settings: 'nav.projectSettings',
};

export const PROJECT_NAVIGATION: readonly ProjectNavigationItem[] = [
  { id: 'overview', icon: LayoutDashboard, shortcut: 'o', label: 'nav.overview', href: (project) => paths.project(project) },
  { id: 'requests', icon: Inbox, shortcut: 'q', label: 'nav.requests', count: (counts) => counts.requestsToHandle, countTone: 'attention', href: (project) => paths.requests(project) },
  { id: 'issues', icon: CircleDot, shortcut: 'i', label: 'nav.issues', href: (project) => paths.issues(project) },
  { id: 'pull-requests', icon: GitPullRequest, shortcut: 'p', label: 'nav.pullRequests', count: (counts) => counts.openPullRequests, countTone: 'neutral', href: (project) => paths.pullRequests(project) },
  { id: 'delivery', icon: Truck, shortcut: 'd', label: 'nav.delivery', href: (project) => paths.delivery(project) },
  { id: 'releases', icon: Rocket, shortcut: 'l', label: 'nav.releases', count: (counts) => counts.releasesToHandle, countTone: 'attention', href: (project) => paths.releases(project) },
  { id: 'audits', icon: ShieldAlert, shortcut: 'a', label: 'nav.audits', count: (counts) => counts.auditsToHandle, countTone: 'attention', href: (project) => paths.audits(project) },
  { id: 'knowledge', icon: BookOpen, shortcut: 'k', label: 'nav.knowledge', href: (project) => paths.knowledge(project) },
  { id: 'project-settings', icon: SlidersHorizontal, shortcut: 's', label: 'nav.projectSettings', href: (project) => paths.projectSettings(project) },
];

export const FACTORY_NAVIGATION: readonly NavigationItem[] = [
  { id: 'usage', icon: Coins, shortcut: 'u', label: 'nav.usage', href: () => paths.usage() },
  { id: 'settings', icon: Settings, shortcut: ',', label: 'nav.settings', href: () => paths.settings() },
];


export const GO_TO_PREFIX_KEY = 'g';
export const GO_TO_TIMEOUT_MS = 1200;
