import type { WatchedFilmOrder, WatchedIssue, WatchedProject, WatchedPullRequest, WatchedRun, WatchedSnapshot } from '../watched-snapshot.ts';

export const READ_AT = new Date('2026-10-12T14:00:00.000Z');
const MILLISECONDS_PER_MINUTE = 60_000;

/** An instant `minutes` before the reading, as the snapshot writes instants. */
export function minutesBefore(minutes: number): string {
  return new Date(READ_AT.getTime() - minutes * MILLISECONDS_PER_MINUTE).toISOString();
}

export function issueView(number: number, overrides: Partial<WatchedIssue> = {}): WatchedIssue {
  return { number, state: 'implementing', paused: false, escalation: null, updatedAt: minutesBefore(1), ...overrides };
}

export function runView(id: string, overrides: Partial<WatchedRun> = {}): WatchedRun {
  return {
    id,
    project: 'storefront',
    role: 'implementer',
    status: 'running',
    outcome: null,
    subject: { kind: 'issue', id: '12' },
    startedAt: minutesBefore(3),
    endedAt: null,
    lastLine: null,
    pendingQuestion: null,
    ...overrides,
  };
}

export function filmOrderView(scenario: string, overrides: Partial<WatchedFilmOrder> = {}): WatchedFilmOrder {
  return { scenario, operator: 'Alex Morgan', state: 'queued', expectedAt: null, filmsAhead: 0, reason: null, since: minutesBefore(1), ...overrides };
}

export function pullRequestView(number: number, issueNumber: number, overrides: Partial<WatchedPullRequest> = {}): WatchedPullRequest {
  return { number, issueNumber, state: 'open', filmOrders: [], ...overrides };
}

export function projectView(id: string, overrides: Partial<WatchedProject> = {}): WatchedProject {
  return { id, pauses: [], scheduler: { worktreeShortage: null }, issues: [], pullRequests: [], ...overrides };
}

export function watchedSnapshot(overrides: Partial<WatchedSnapshot> = {}): WatchedSnapshot {
  return { generatedAt: READ_AT.toISOString(), installation: { pauses: [] }, projects: [projectView('storefront')], runs: [], ...overrides };
}

/** A snapshot of the storefront project holding these issues and these runs. */
export function storefrontWith(issues: readonly WatchedIssue[], runs: readonly WatchedRun[] = []): WatchedSnapshot {
  return watchedSnapshot({ projects: [projectView('storefront', { issues: [...issues] })], runs: [...runs] });
}
