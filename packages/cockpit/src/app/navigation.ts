import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CircleDot,
  Coins,
  GitPullRequest,
  HeartPulse,
  Inbox,
  LayoutGrid,
  Rocket,
  Settings,
  ShieldAlert,
  SquareTerminal,
  Workflow,
} from 'lucide-react';
import type { ViewId } from '../model/routes.ts';
import type { NavigationCounts } from './derived.ts';

export interface NavigationItem {
  readonly id: ViewId;
  readonly icon: LucideIcon;
  readonly shortcut: string;
  readonly count?: ((counts: NavigationCounts) => number) | undefined;
  readonly countTone?: 'attention' | 'live' | 'neutral' | undefined;
}

export interface NavigationGroup {
  readonly title: string | null;
  readonly items: readonly NavigationItem[];
}

export const NAVIGATION: readonly NavigationGroup[] = [
  {
    title: null,
    items: [{ id: 'board', icon: LayoutGrid, shortcut: 't', count: (counts) => counts.needsYou, countTone: 'attention' }],
  },
  {
    title: 'Travail',
    items: [
      { id: 'requests', icon: Inbox, shortcut: 'd', count: (counts) => counts.requestsToHandle, countTone: 'attention' },
      { id: 'issues', icon: CircleDot, shortcut: 'i' },
      { id: 'runs', icon: SquareTerminal, shortcut: 'r', count: (counts) => counts.liveRuns, countTone: 'live' },
      { id: 'pull-requests', icon: GitPullRequest, shortcut: 'p', count: (counts) => counts.openPullRequests, countTone: 'neutral' },
    ],
  },
  {
    title: 'Livraison',
    items: [
      { id: 'ci', icon: Workflow, shortcut: 'c' },
      { id: 'releases', icon: Rocket, shortcut: 'l' },
      { id: 'audits', icon: ShieldAlert, shortcut: 'a', count: (counts) => counts.auditsToHandle, countTone: 'attention' },
    ],
  },
  {
    title: 'Pilotage',
    items: [
      { id: 'health', icon: HeartPulse, shortcut: 's' },
      { id: 'costs', icon: Coins, shortcut: 'o' },
      { id: 'knowledge', icon: BookOpen, shortcut: 'k' },
      { id: 'settings', icon: Settings, shortcut: ',' },
    ],
  },
];

export const NAVIGATION_ITEMS: readonly NavigationItem[] = NAVIGATION.flatMap((group) => group.items);
export const GO_TO_PREFIX_KEY = 'g';
export const GO_TO_TIMEOUT_MS = 1200;
