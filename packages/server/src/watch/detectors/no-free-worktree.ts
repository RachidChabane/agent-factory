import { BLOCKER_KINDS, blockerKey, type BlockerDetector } from '../blocker.ts';
import type { WatchedProject } from '../watched-snapshot.ts';

type Shortage = NonNullable<WatchedProject['scheduler']['worktreeShortage']>;
type Holder = Shortage['holders'][number];

const LIST_SEPARATOR = ', ';

function holderText(holder: Holder): string {
  const state = holder.state === null ? '' : ` (${holder.state})`;
  const pullRequest = holder.pullRequestNumber === null ? '' : ` with pull request #${holder.pullRequestNumber}`;
  return `#${holder.issueNumber}${pullRequest}${state}`;
}

/** Validated issues that wait only because every worktree of a project's pool is held. */
export const noFreeWorktreeDetector: BlockerDetector = {
  kind: BLOCKER_KINDS.noFreeWorktree,
  detect: (snapshot) =>
    snapshot.projects.flatMap((project) => {
      const shortage = project.scheduler.worktreeShortage;
      if (shortage === null) return [];
      const waiting = shortage.waiting.map((number) => `#${number}`).join(LIST_SEPARATOR);
      return [
        {
          key: blockerKey(BLOCKER_KINDS.noFreeWorktree, project.id, shortage.since),
          kind: BLOCKER_KINDS.noFreeWorktree,
          project: project.id,
          issue: null,
          detail: `pool ${shortage.holders.length}/${shortage.poolSize} held by ${shortage.holders.map(holderText).join(LIST_SEPARATOR)}; waiting since ${shortage.since}: ${waiting}`,
        },
      ];
    }),
};
