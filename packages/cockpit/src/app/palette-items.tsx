import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  CircleCheck,
  CircleDot,
  GitMerge,
  GitPullRequest,
  Inbox,
  MessageSquare,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Scale,
  ShieldAlert,
  SquareTerminal,
  Sun,
} from 'lucide-react';
import { MERGED_OR_BEYOND_STATES } from '@agent-factory/domain';
import type { CockpitSnapshot } from '../contract/index.ts';
import { ISSUE_STATE_LABELS, RELEASE_STATE_LABELS, REQUEST_STATE_LABELS, ROLE_LABELS, RUN_STATUS_LABELS } from '../i18n/labels.ts';
import { MERGE_QUERY_PARAMETER, NEW_REQUEST_QUERY_PARAMETER, QUERY_FLAG } from '../model/query-flags.ts';
import { paths, VIEW_PATHS, VIEW_TITLES } from '../model/routes.ts';
import type { PaletteItem } from '../ui/components/CommandPalette.tsx';
import type { CommandRunner } from './hooks.ts';
import { useCommand, useSnapshot } from './hooks.ts';
import { NAVIGATION_ITEMS } from './navigation.ts';
import { useTheme } from './ThemeProvider.tsx';

const ICON_SIZE = 15;

interface PaletteContext {
  readonly navigate: (to: string) => void;
  readonly command: CommandRunner;
}

function actionItems(snapshot: CockpitSnapshot, { navigate, command }: PaletteContext): PaletteItem[] {
  const group = 'Actions';
  const merged = new Set(snapshot.issues.filter((issue) => MERGED_OR_BEYOND_STATES.includes(issue.state)).map((issue) => issue.number));
  const items: PaletteItem[] = [
    {
      id: 'action:new-request',
      group,
      label: 'Nouvelle demande…',
      icon: <Plus size={ICON_SIZE} />,
      keywords: 'coller créer demande request',
      perform: () => navigate(`${VIEW_PATHS.requests}?${NEW_REQUEST_QUERY_PARAMETER}=${QUERY_FLAG}`),
    },
  ];
  for (const request of snapshot.requests.filter((entry) => entry.state === 'received')) {
    items.push({
      id: `action:challenge:${request.id}`,
      group,
      label: `Lancer le challenge ${request.id}`,
      hint: request.title,
      icon: <Scale size={ICON_SIZE} />,
      perform: () => void command.run('request.challenge', { requestId: request.id }, `Challenge de ${request.id} lancé`),
    });
  }
  for (const issue of snapshot.issues) {
    if (issue.state === 'spec-draft') {
      items.push({
        id: `action:validate:${issue.number}`,
        group,
        label: `Valider la spec #${issue.number}`,
        hint: issue.title,
        icon: <CircleCheck size={ICON_SIZE} />,
        perform: () => void command.run('issue.validate-spec', { issueNumber: issue.number }, `Spec #${issue.number} validée`),
      });
    }
    if (issue.state === 'spec-validated' && issue.dependsOn.every((number) => merged.has(number))) {
      items.push({
        id: `action:start:${issue.number}`,
        group,
        label: `Démarrer #${issue.number}`,
        hint: issue.title,
        icon: <Play size={ICON_SIZE} />,
        perform: () => void command.run('issue.start', { issueNumber: issue.number }, `#${issue.number} démarrée`),
      });
    }
    if (issue.state === 'needs-human') {
      items.push({
        id: `action:resume:${issue.number}`,
        group,
        label: `Traiter l’escalade #${issue.number}`,
        hint: issue.title,
        icon: <RotateCcw size={ICON_SIZE} />,
        perform: () => navigate(paths.issue(issue.number)),
      });
    }
  }
  for (const pullRequest of snapshot.pullRequests.filter((entry) => entry.state === 'open' && entry.mergeable)) {
    items.push({
      id: `action:merge:${pullRequest.number}`,
      group,
      label: `Merger #${pullRequest.number}…`,
      hint: pullRequest.title,
      icon: <GitMerge size={ICON_SIZE} />,
      perform: () => navigate(`${paths.pullRequest(pullRequest.number)}?${MERGE_QUERY_PARAMETER}=${QUERY_FLAG}`),
    });
  }
  for (const run of snapshot.runs.filter((entry) => entry.pendingQuestion !== null)) {
    items.push({
      id: `action:answer:${run.id}`,
      group,
      label: `Répondre à la question du run ${run.id}`,
      hint: run.pendingQuestion?.text,
      icon: <MessageSquare size={ICON_SIZE} />,
      perform: () => navigate(paths.run(run.id)),
    });
  }
  for (const release of snapshot.releases.filter((entry) => entry.state === 'blocked' || entry.state === 'promotable' || entry.state === 'auditing')) {
    items.push({
      id: `action:evaluate:${release.id}`,
      group,
      label: `Réévaluer le gate ${release.id}`,
      icon: <RefreshCw size={ICON_SIZE} />,
      perform: () => void command.run('release.evaluate', { releaseId: release.id }, `Gate ${release.id} réévalué`),
    });
  }
  items.push(
    snapshot.factory.schedulerPaused
      ? {
          id: 'action:scheduler-resume',
          group,
          label: 'Reprendre l’ordonnanceur',
          icon: <Play size={ICON_SIZE} />,
          perform: () => void command.run('scheduler.resume', {}, 'Ordonnanceur relancé'),
        }
      : {
          id: 'action:scheduler-pause',
          group,
          label: 'Mettre l’ordonnanceur en pause',
          icon: <Pause size={ICON_SIZE} />,
          perform: () => void command.run('scheduler.pause', {}, 'Ordonnanceur en pause'),
        },
  );
  return items;
}

function entityItems(snapshot: CockpitSnapshot, navigate: (to: string) => void): PaletteItem[] {
  return [
    ...snapshot.requests.map((request) => ({
      id: `request:${request.id}`,
      group: 'Demandes',
      label: `${request.id} · ${request.title}`,
      hint: REQUEST_STATE_LABELS[request.state],
      icon: <Inbox size={ICON_SIZE} />,
      keywords: request.requester,
      perform: () => navigate(paths.request(request.id)),
    })),
    ...snapshot.issues.map((issue) => ({
      id: `issue:${issue.number}`,
      group: 'Issues',
      label: `#${issue.number} · ${issue.title}`,
      hint: ISSUE_STATE_LABELS[issue.state],
      icon: <CircleDot size={ICON_SIZE} />,
      keywords: `${issue.type} ${issue.branch ?? ''}`,
      perform: () => navigate(paths.issue(issue.number)),
    })),
    ...snapshot.runs.map((run) => ({
      id: `run:${run.id}`,
      group: 'Runs',
      label: `${run.id} · ${ROLE_LABELS[run.role]} · ${run.subject.kind === 'issue' ? `#${run.subject.id}` : run.subject.id}`,
      hint: RUN_STATUS_LABELS[run.status],
      icon: <SquareTerminal size={ICON_SIZE} />,
      keywords: `${run.model} ${run.branch ?? ''}`,
      perform: () => navigate(paths.run(run.id)),
    })),
    ...snapshot.pullRequests.map((pullRequest) => ({
      id: `pr:${pullRequest.number}`,
      group: 'Pull requests',
      label: `#${pullRequest.number} · ${pullRequest.title}`,
      icon: <GitPullRequest size={ICON_SIZE} />,
      keywords: pullRequest.branch,
      perform: () => navigate(paths.pullRequest(pullRequest.number)),
    })),
    ...snapshot.releases.map((release) => ({
      id: `release:${release.id}`,
      group: 'Releases',
      label: `Release ${release.id}`,
      hint: RELEASE_STATE_LABELS[release.state],
      icon: <Rocket size={ICON_SIZE} />,
      perform: () => navigate(paths.release(release.id)),
    })),
    ...snapshot.audits.map((audit) => ({
      id: `audit:${audit.id}`,
      group: 'Audits',
      label: `${audit.id} · ${audit.commitMessage}`,
      icon: <ShieldAlert size={ICON_SIZE} />,
      keywords: `${audit.authorLogin ?? ''} ${audit.authorName ?? ''} ${audit.commitSha}`,
      perform: () => navigate(paths.audit(audit.id)),
    })),
  ];
}

export function usePaletteItems(): readonly PaletteItem[] {
  const snapshot = useSnapshot();
  const navigate = useNavigate();
  const command = useCommand();
  const { theme, toggle } = useTheme();
  return useMemo(() => {
    const navigation: PaletteItem[] = NAVIGATION_ITEMS.map((item) => {
      const Icon = item.icon;
      return {
        id: `view:${item.id}`,
        group: 'Navigation',
        label: VIEW_TITLES[item.id],
        hint: `G puis ${item.shortcut.toUpperCase()}`,
        icon: <Icon size={ICON_SIZE} />,
        perform: () => navigate(VIEW_PATHS[item.id]),
      };
    });
    const themeItem: PaletteItem = {
      id: 'action:theme',
      group: 'Actions',
      label: theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre',
      icon: theme === 'dark' ? <Sun size={ICON_SIZE} /> : <Moon size={ICON_SIZE} />,
      keywords: 'thème sombre clair apparence',
      perform: toggle,
    };
    if (snapshot === null) return [themeItem, ...navigation];
    const context = { navigate: (to: string) => void navigate(to), command };
    return [...actionItems(snapshot, context), themeItem, ...navigation, ...entityItems(snapshot, context.navigate)];
  }, [snapshot, navigate, command, theme, toggle]);
}
