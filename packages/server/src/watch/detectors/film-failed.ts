import { BLOCKER_KINDS, blockerKey, type Blocker, type BlockerDetector } from '../blocker.ts';
import { OPEN_PULL_REQUEST_STATE, oneLine } from './snapshot-queries.ts';

const FAILED_FILM_STATE = 'failed';
const NO_REASON = 'no reason recorded';

/**
 * A film of an open pull request whose latest recording failed. A failed film does not hold the merge,
 * so it stays reported until it is ordered again or the pull request ends.
 */
export const filmFailedDetector: BlockerDetector = {
  kind: BLOCKER_KINDS.filmFailed,
  detect: (snapshot) =>
    snapshot.projects.flatMap((project) =>
      project.pullRequests
        .filter((pullRequest) => pullRequest.state === OPEN_PULL_REQUEST_STATE)
        .flatMap((pullRequest) =>
          pullRequest.filmOrders
            .filter((order) => order.state === FAILED_FILM_STATE)
            .map(
              (order): Blocker => ({
                key: blockerKey(BLOCKER_KINDS.filmFailed, project.id, pullRequest.number, order.scenario, order.since),
                kind: BLOCKER_KINDS.filmFailed,
                project: project.id,
                issue: pullRequest.issueNumber,
                detail: `film ${order.scenario} of pull request #${pullRequest.number}: ${oneLine(order.reason ?? NO_REASON)}`,
              }),
            ),
        ),
    ),
};
