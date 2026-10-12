import type { RunSubjectKind, RunView } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { isLiveRun } from '../../model/projects.ts';

/** The runs working on one subject of one project right now, the most recently started first. Subjects are scoped by project because issue numbers repeat across projects. */
export function liveRunsOfSubject(runs: readonly RunView[], project: string, kind: RunSubjectKind, id: string): readonly RunView[] {
  return runs
    .filter((run) => run.project === project && run.subject.kind === kind && run.subject.id === id && isLiveRun(run))
    .toSorted((left, right) => toEpoch(right.startedAt) - toEpoch(left.startedAt));
}

/** The run an operator should look at first: one that waits for an answer, else the most recent. */
export function runToFollow(runs: readonly RunView[]): RunView | null {
  return runs.find((run) => run.pendingQuestion !== null) ?? runs[0] ?? null;
}
