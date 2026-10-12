import { useMemo } from 'react';
import type { NavigateFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { CirclePlay, FilePlus2, GitMerge, HeartPulse, Inbox, Pause, Play, Power, RefreshCw, Rocket, ScanSearch, ShieldCheck, SquareCheck } from 'lucide-react';
import type { CockpitSnapshot, CommandBody, CommandName, ProjectView } from '../contract/index.ts';
import type { Translate } from '../i18n/create-i18n.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { canChallengeRequest, canCutRelease, canEvaluateRelease, canPublishAuditIssue, canStartIssue, canValidateSpec, drainBlock } from '../model/actions.ts';
import { deriveAttention } from '../model/attention.ts';
import { shortSha } from '../model/identifiers.ts';
import { paths } from '../model/routes.ts';
import type { PaletteItem } from '../ui/components/CommandPalette.tsx';
import { useCommand } from './hooks.ts';
import { useMaybeSnapshot } from './hooks.ts';
import type { NavigationItem } from './navigation.ts';
import { FACTORY_NAVIGATION, PROJECT_NAVIGATION, WORKSPACE_NAVIGATION } from './navigation.ts';

type RunCommand = <Name extends CommandName>(name: Name, body: CommandBody<Name>) => void;

interface PaletteContext {
  readonly snapshot: CockpitSnapshot;
  readonly t: Translate;
  readonly navigate: NavigateFunction;
  readonly run: RunCommand;
  /** Opens the confirmation that stops the factory once its running work finishes. */
  readonly askDrain: () => void;
}

function navigationItem(context: PaletteContext, item: NavigationItem, href: string): PaletteItem {
  const { t, navigate } = context;
  const Icon = item.icon;
  return {
    id: `go:${href}`,
    group: t('palette.group.go'),
    label: t('palette.goTo', { page: t(item.label) }),
    icon: <Icon size={14} />,
    keywords: `${item.id} ${t(item.label)}`,
    perform: () => void navigate(href),
  };
}

function projectNavigationItems(context: PaletteContext, project: ProjectView): PaletteItem[] {
  const { t, navigate } = context;
  return PROJECT_NAVIGATION.map((item) => {
    const Icon = item.icon;
    const href = item.href(project.id);
    return {
      id: `project:${project.id}:${item.id}`,
      group: t('palette.group.projects'),
      label: item.id === 'overview' ? t('palette.goToProject', { project: project.name }) : t('palette.goToProjectPage', { page: t(item.label), project: project.name }),
      icon: <Icon size={14} />,
      keywords: `${project.id} ${project.name} ${item.id} ${t(item.label)}`,
      perform: () => void navigate(href),
    };
  });
}

function actionItem(context: PaletteContext, entry: Pick<PaletteItem, 'id' | 'label' | 'icon' | 'hint' | 'keywords' | 'perform'>): PaletteItem {
  return { group: context.t('palette.group.actions'), ...entry };
}

function pauseItems(context: PaletteContext): PaletteItem[] {
  const { snapshot, t, run } = context;
  const installationPaused = snapshot.installation.pauses.some((pause) => pause.cause === 'operator');
  const items = [
    actionItem(context, {
      id: 'scheduler:installation',
      label: installationPaused ? t('pause.resumeInstallation') : t('pause.pauseInstallation'),
      icon: installationPaused ? <Play size={14} /> : <Pause size={14} />,
      keywords: 'scheduler pause resume',
      perform: () => run(installationPaused ? 'scheduler.resume' : 'scheduler.pause', { project: null }),
    }),
  ];
  for (const project of snapshot.projects) {
    const paused = project.pauses.some((pause) => pause.cause === 'operator');
    items.push(
      actionItem(context, {
        id: `scheduler:${project.id}`,
        label: paused ? t('palette.resumeProject', { project: project.name }) : t('palette.pauseProject', { project: project.name }),
        icon: paused ? <Play size={14} /> : <Pause size={14} />,
        keywords: `${project.id} scheduler pause resume`,
        perform: () => run(paused ? 'scheduler.resume' : 'scheduler.pause', { project: project.id }),
      }),
    );
  }
  return items;
}

function drainItems(context: PaletteContext): PaletteItem[] {
  const { snapshot, t, askDrain } = context;
  if (drainBlock(snapshot.installation) !== null) return [];
  return [
    actionItem(context, {
      id: 'factory:drain',
      label: t('drain.label'),
      icon: <Power size={14} />,
      keywords: 'factory drain stop restart',
      perform: askDrain,
    }),
  ];
}

/** Merging asks for the operator's confirmation on the page of the pull request, so the palette leads there. */
function mergeItems(context: PaletteContext, project: ProjectView): PaletteItem[] {
  const { snapshot, t, navigate } = context;
  return deriveAttention(snapshot, project.id)
    .filter((item) => item.kind === 'merge')
    .map((item) =>
      actionItem(context, {
        id: `merge:${item.key}`,
        label: t('palette.mergePullRequest', { reference: item.reference }),
        hint: `${project.name} · ${item.title}`,
        icon: <GitMerge size={14} />,
        keywords: `${project.id} ${item.reference} ${item.title} merge pull request`,
        perform: () => void navigate(item.href),
      }),
    );
}

function projectActionItems(context: PaletteContext, project: ProjectView): PaletteItem[] {
  const { t, navigate, run } = context;
  const items: PaletteItem[] = [
    actionItem(context, {
      id: `new-request:${project.id}`,
      label: t('palette.newRequest', { project: project.name }),
      icon: <FilePlus2 size={14} />,
      keywords: `${project.id} request create`,
      perform: () => void navigate(paths.newRequest(project.id)),
    }),
  ];
  for (const issue of project.issues) {
    if (canValidateSpec(issue)) {
      items.push(
        actionItem(context, {
          id: `validate:${project.id}:${issue.number}`,
          label: t('palette.validateSpec', { number: issue.number }),
          hint: `${project.name} · ${issue.title}`,
          icon: <SquareCheck size={14} />,
          keywords: `${project.id} #${issue.number} ${issue.title} spec validate`,
          perform: () => run('issue.validate-spec', { project: project.id, issueNumber: issue.number }),
        }),
      );
    }
    if (canStartIssue(issue, project)) {
      items.push(
        actionItem(context, {
          id: `start:${project.id}:${issue.number}`,
          label: t('palette.startIssue', { number: issue.number }),
          hint: `${project.name} · ${issue.title}`,
          icon: <CirclePlay size={14} />,
          keywords: `${project.id} #${issue.number} ${issue.title} start`,
          perform: () => run('issue.start', { project: project.id, issueNumber: issue.number }),
        }),
      );
    }
  }
  items.push(...mergeItems(context, project));
  for (const request of project.requests) {
    if (!canChallengeRequest(request)) continue;
    items.push(
      actionItem(context, {
        id: `challenge:${project.id}:${request.id}`,
        label: t('palette.startChallenge', { request: request.id }),
        hint: `${project.name} · ${request.title}`,
        icon: <Inbox size={14} />,
        keywords: `${project.id} ${request.id} ${request.title} challenge`,
        perform: () => run('request.challenge', { project: project.id, requestId: request.id }),
      }),
    );
  }
  for (const release of project.releases) {
    if (canCutRelease(release)) {
      items.push(
        actionItem(context, {
          id: `cut:${project.id}:${release.id}`,
          label: t('palette.cutRelease', { release: release.id }),
          hint: project.name,
          icon: <Rocket size={14} />,
          keywords: `${project.id} ${release.id} release cut`,
          perform: () => run('release.cut', { project: project.id, releaseId: release.id }),
        }),
      );
    }
    if (canEvaluateRelease(release)) {
      items.push(
        actionItem(context, {
          id: `evaluate:${project.id}:${release.id}`,
          label: t('palette.evaluateRelease', { release: release.id }),
          hint: project.name,
          icon: <ScanSearch size={14} />,
          keywords: `${project.id} ${release.id} release evaluate gate`,
          perform: () => run('release.evaluate', { project: project.id, releaseId: release.id }),
        }),
      );
    }
  }
  for (const audit of project.audits) {
    if (!canPublishAuditIssue(audit)) continue;
    items.push(
      actionItem(context, {
        id: `publish-audit:${project.id}:${audit.id}`,
        label: t('palette.publishAudit', { audit: shortSha(audit.commitSha) }),
        hint: `${project.name} · ${audit.commitMessage}`,
        icon: <ShieldCheck size={14} />,
        keywords: `${project.id} ${audit.id} ${audit.commitSha} audit publish issue`,
        perform: () => run('audit.publish-issue', { project: project.id, auditId: audit.id }),
      }),
    );
  }
  for (const environment of project.environments) {
    items.push(
      actionItem(context, {
        id: `health:${project.id}:${environment.name}`,
        label: t('palette.checkHealth', { environment: environment.name }),
        hint: project.name,
        icon: <HeartPulse size={14} />,
        keywords: `${project.id} ${environment.name} health check`,
        perform: () => run('health.check', { project: project.id, environment: environment.name }),
      }),
    );
  }
  return items;
}

/** Everything the palette offers: a page for every view and every project, and the commands that make sense from anywhere. */
export function buildPaletteItems(context: PaletteContext): readonly PaletteItem[] {
  const { snapshot, t, run } = context;
  return [
    ...[...WORKSPACE_NAVIGATION, ...FACTORY_NAVIGATION].map((item) => navigationItem(context, item, item.href(null))),
    ...snapshot.projects.flatMap((project) => projectNavigationItems(context, project)),
    actionItem(context, {
      id: 'usage:refresh',
      label: t('palette.refreshUsage'),
      icon: <RefreshCw size={14} />,
      keywords: 'usage subscription refresh',
      perform: () => run('usage.refresh', {}),
    }),
    ...pauseItems(context),
    ...drainItems(context),
    ...snapshot.projects.flatMap((project) => projectActionItems(context, project)),
  ];
}

export function usePaletteItems(askDrain: () => void): readonly PaletteItem[] {
  const snapshot = useMaybeSnapshot();
  const navigate = useNavigate();
  const { t } = useI18n();
  const runner = useCommand();
  const { run: sendCommand } = runner;
  return useMemo(() => {
    if (snapshot === null) return [];
    const run: RunCommand = (name, body) => void sendCommand(name, body);
    return buildPaletteItems({ snapshot, t, navigate, run, askDrain });
  }, [snapshot, t, navigate, sendCommand, askDrain]);
}
