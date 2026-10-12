import { useMemo } from 'react';
import { useLocation } from 'react-router';
import type { ForgeKind } from '../contract/index.ts';
import type { AttentionItem } from '../model/attention.ts';
import { auditNeedsOperator, deriveAttention, releaseNeedsOperator } from '../model/attention.ts';
import type { Board } from '../model/board.ts';
import { deriveBoard } from '../model/board.ts';
import { isLiveRun } from '../model/projects.ts';
import { PROJECT_QUERY_PARAMETER, projectOfPath } from '../model/routes.ts';
import { useNow } from './context.tsx';
import { useMaybeSnapshot, useSnapshot } from './hooks.ts';

export function useBoard(): Board {
  const snapshot = useSnapshot();
  const now = useNow();
  return useMemo(() => deriveBoard(snapshot, now), [snapshot, now]);
}

const NO_ATTENTION: readonly AttentionItem[] = [];

/** What waits for the operator in one project or in all of them; nothing while the snapshot is not loaded. */
export function useAttention(project: string | null): readonly AttentionItem[] {
  const snapshot = useMaybeSnapshot();
  return useMemo(() => (snapshot === null ? NO_ATTENTION : deriveAttention(snapshot, project)), [snapshot, project]);
}

export interface NavigationCounts {
  readonly attention: number;
  readonly liveRuns: number;
  readonly requestsToHandle: number;
  readonly openPullRequests: number;
  readonly auditsToHandle: number;
  readonly releasesToHandle: number;
}

/** The counters of the sidebar, for one project or for the whole installation. */
export function useNavigationCounts(project: string | null): NavigationCounts {
  const snapshot = useMaybeSnapshot();
  return useMemo(() => {
    if (snapshot === null) return { attention: 0, liveRuns: 0, requestsToHandle: 0, openPullRequests: 0, auditsToHandle: 0, releasesToHandle: 0 };
    const projects = project === null ? snapshot.projects : snapshot.projects.filter((candidate) => candidate.id === project);
    return {
      attention: deriveAttention(snapshot, project).length,
      liveRuns: snapshot.runs.filter((run) => isLiveRun(run) && (project === null || run.project === project)).length,
      requestsToHandle: projects.flatMap((candidate) => candidate.requests).filter((request) => request.state === 'received' || request.state === 'challenged').length,
      openPullRequests: projects.flatMap((candidate) => candidate.pullRequests).filter((pullRequest) => pullRequest.state === 'open').length,
      auditsToHandle: projects.flatMap((candidate) => candidate.audits).filter(auditNeedsOperator).length,
      releasesToHandle: projects.flatMap((candidate) => candidate.releases).filter(releaseNeedsOperator).length,
    };
  }, [snapshot, project]);
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly forge: ForgeKind;
  readonly attention: number;
  readonly liveRuns: number;
  /** Whether the project has a pause of its own; a pause of the whole installation is shown elsewhere. */
  readonly paused: boolean;
}

export function useProjectSummaries(): readonly ProjectSummary[] {
  const snapshot = useMaybeSnapshot();
  return useMemo(() => {
    if (snapshot === null) return [];
    return snapshot.projects.map((project) => ({
      id: project.id,
      name: project.name,
      forge: project.forge.kind,
      attention: deriveAttention(snapshot, project.id).length,
      liveRuns: snapshot.runs.filter((run) => isLiveRun(run) && run.project === project.id).length,
      paused: project.pauses.length > 0,
    }));
  }, [snapshot]);
}

/**
 * The project the operator is looking at: the one in the address of a project page, or the one a
 * board or run list is filtered on. An identifier the installation does not know selects nothing.
 */
export function useSelectedProject(): string | null {
  const snapshot = useMaybeSnapshot();
  const location = useLocation();
  const candidate = projectOfPath(location.pathname) ?? new URLSearchParams(location.search).get(PROJECT_QUERY_PARAMETER);
  if (candidate === null || snapshot === null) return null;
  return snapshot.projects.some((project) => project.id === candidate) ? candidate : null;
}
