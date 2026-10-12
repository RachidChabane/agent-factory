import { RUNNING_PIPELINE_STATES } from '@agent-factory/application';
import { BLOCKER_KINDS, blockerKey, type Blocker, type BlockerDetector } from '../blocker.ts';
import type { WatchedRun, WatchedSnapshot } from '../watched-snapshot.ts';
import { issueOfRun, oneLine } from './snapshot-queries.ts';

const FAILED_STATUS = 'failed';
const SUBJECT_SEPARATOR = '|';

function subjectKey(run: WatchedRun): string {
  return [run.project ?? '', run.subject.kind, run.subject.id].join(SUBJECT_SEPARATOR);
}

/** The newest run of each piece of work: an older failure is over once the work ran again. */
function latestRuns(runs: readonly WatchedRun[]): readonly WatchedRun[] {
  const latest = new Map<string, WatchedRun>();
  for (const run of runs) {
    const known = latest.get(subjectKey(run));
    if (known === undefined || run.startedAt > known.startedAt) latest.set(subjectKey(run), run);
  }
  return [...latest.values()];
}

function stillOwed(snapshot: WatchedSnapshot, run: WatchedRun): boolean {
  const issueNumber = issueOfRun(run);
  if (issueNumber === null) return true;
  const issue = snapshot.projects.find((project) => project.id === run.project)?.issues.find((candidate) => candidate.number === issueNumber);
  return issue !== undefined && RUNNING_PIPELINE_STATES.includes(issue.state);
}

/**
 * The latest run of a piece of work, when it failed a short while ago and the work is still owed:
 * an issue still in a stage of the pipeline, or any other work. An escalated issue has its own kind.
 */
export const runFailedDetector: BlockerDetector = {
  kind: BLOCKER_KINDS.runFailed,
  detect: (snapshot, { now, thresholds }) =>
    latestRuns(snapshot.runs).flatMap((run): Blocker[] => {
      if (run.status !== FAILED_STATUS || run.endedAt === null || run.project === null) return [];
      if (now.getTime() - new Date(run.endedAt).getTime() > thresholds.failedRunWindowMs || !stillOwed(snapshot, run)) return [];
      const last = run.lastLine === null ? '' : `: ${oneLine(run.lastLine)}`;
      return [
        {
          key: blockerKey(BLOCKER_KINDS.runFailed, run.project, run.id),
          kind: BLOCKER_KINDS.runFailed,
          project: run.project,
          issue: issueOfRun(run),
          detail: `${run.role} run ${run.id} ended ${run.outcome ?? FAILED_STATUS}${last}`,
        },
      ];
    }),
};
