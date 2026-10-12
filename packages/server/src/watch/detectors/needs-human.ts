import { ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import { BLOCKER_KINDS, blockerKey, type BlockerDetector } from '../blocker.ts';
import { awaitsAnswer, oneLine } from './snapshot-queries.ts';

/** An issue the factory stopped because only a person can go on, with the reason it gave. An agent's question has its own kind. */
export const needsHumanDetector: BlockerDetector = {
  kind: BLOCKER_KINDS.needsHuman,
  detect: (snapshot) =>
    snapshot.projects.flatMap((project) =>
      project.issues.flatMap((issue) => {
        if (issue.state !== ISSUE_ESCALATION_STATE || issue.escalation === null || awaitsAnswer(snapshot, project.id, issue.number)) return [];
        return [
          {
            key: blockerKey(BLOCKER_KINDS.needsHuman, project.id, issue.number, issue.escalation.since),
            kind: BLOCKER_KINDS.needsHuman,
            project: project.id,
            issue: issue.number,
            detail: oneLine(issue.escalation.reason),
          },
        ];
      }),
    ),
};
