import { useMemo } from 'react';
import type { Board } from '../model/board.ts';
import { deriveBoard } from '../model/board.ts';
import { useNow } from './context.tsx';
import { useSnapshot } from './hooks.ts';

const EMPTY_BOARD: Board = { columns: { 'needs-you': [], 'in-progress': [], done: [] }, total: 0 };

export function useBoard(): Board {
  const snapshot = useSnapshot();
  const now = useNow();
  return useMemo(() => (snapshot === null ? EMPTY_BOARD : deriveBoard(snapshot, now)), [snapshot, now]);
}

export interface NavigationCounts {
  readonly needsYou: number;
  readonly liveRuns: number;
  readonly openPullRequests: number;
  readonly auditsToHandle: number;
  readonly requestsToHandle: number;
}

export function useNavigationCounts(): NavigationCounts {
  const snapshot = useSnapshot();
  const board = useBoard();
  return useMemo(
    () => ({
      needsYou: board.columns['needs-you'].length,
      liveRuns: snapshot?.runs.filter((run) => run.status === 'running' || run.status === 'waiting').length ?? 0,
      openPullRequests: snapshot?.pullRequests.filter((pullRequest) => pullRequest.state === 'open').length ?? 0,
      auditsToHandle:
        snapshot?.audits.filter((audit) => (audit.state === 'challenge' || audit.state === 'rewrite') && !audit.resolved).length ?? 0,
      requestsToHandle: snapshot?.requests.filter((request) => request.state === 'received' || request.state === 'challenged').length ?? 0,
    }),
    [snapshot, board],
  );
}
