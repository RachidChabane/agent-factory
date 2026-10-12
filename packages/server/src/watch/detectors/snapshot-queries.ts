import type { WatchedProject, WatchedRun, WatchedSnapshot } from '../watched-snapshot.ts';

const DETAIL_LIMIT = 300;
const ELLIPSIS = '…';
const WHITESPACE = /\s+/g;
const ISSUE_SUBJECT_KIND = 'issue';

/** A text on one line, cut to what a line of the report can carry. */
export function oneLine(text: string): string {
  const flat = text.replace(WHITESPACE, ' ').trim();
  return flat.length <= DETAIL_LIMIT ? flat : `${flat.slice(0, DETAIL_LIMIT - ELLIPSIS.length)}${ELLIPSIS}`;
}

/** The issue number a run works on, or null when its subject is another kind of work. */
export function issueOfRun(run: WatchedRun): number | null {
  return run.subject.kind === ISSUE_SUBJECT_KIND ? Number(run.subject.id) : null;
}

export function runsOfIssue(snapshot: WatchedSnapshot, project: string, issueNumber: number): readonly WatchedRun[] {
  return snapshot.runs.filter((run) => run.project === project && issueOfRun(run) === issueNumber);
}

/** Whether an agent of this project waits for an answer about this issue. */
export function awaitsAnswer(snapshot: WatchedSnapshot, project: string, issueNumber: number): boolean {
  return runsOfIssue(snapshot, project, issueNumber).some((run) => run.pendingQuestion !== null);
}

export function isProjectPaused(snapshot: WatchedSnapshot, project: WatchedProject): boolean {
  return snapshot.installation.pauses.length > 0 || project.pauses.length > 0;
}
