import { BLOCKER_KINDS, blockerKey, type Blocker, type BlockerDetector } from '../blocker.ts';
import { issueOfRun, oneLine } from './snapshot-queries.ts';

/** A run that asked a question only a person can answer, and waits for the answer. */
export const decisionPendingDetector: BlockerDetector = {
  kind: BLOCKER_KINDS.decisionPending,
  detect: (snapshot) =>
    snapshot.runs.flatMap((run): Blocker[] => {
      const { pendingQuestion } = run;
      if (pendingQuestion === null || run.project === null) return [];
      return [
        {
          key: blockerKey(BLOCKER_KINDS.decisionPending, run.project, run.id, pendingQuestion.id),
          kind: BLOCKER_KINDS.decisionPending,
          project: run.project,
          issue: issueOfRun(run),
          detail: `${oneLine(pendingQuestion.text)} (run ${run.id})`,
        },
      ];
    }),
};
