import { BLOCKER_KINDS, blockerKey, type Blocker, type BlockerDetector } from '../blocker.ts';
import type { WatchedSnapshot } from '../watched-snapshot.ts';
import { oneLine } from './snapshot-queries.ts';

type WatchedPause = WatchedSnapshot['installation']['pauses'][number];

/** The pauses that stop work by someone's order or by a limit; a drain is the factory stopping on request. */
const REPORTED_CAUSES: readonly WatchedPause['cause'][] = ['operator', 'budget', 'resources'];

function blockerOf(pause: WatchedPause, project: string | null): Blocker {
  const resumes = pause.resumesAt === null ? '' : `, resumes ${pause.resumesAt}`;
  return {
    key: blockerKey(BLOCKER_KINDS.paused, project ?? '', pause.cause, pause.since),
    kind: BLOCKER_KINDS.paused,
    project,
    issue: null,
    detail: `${pause.cause} pause since ${pause.since}${resumes}: ${oneLine(pause.reason)}`,
  };
}

/** A pause of the factory or of a project that has lasted past the threshold. */
export const pausedDetector: BlockerDetector = {
  kind: BLOCKER_KINDS.paused,
  detect: (snapshot, { now, thresholds }) => {
    const lasting = (pause: WatchedPause): boolean =>
      REPORTED_CAUSES.includes(pause.cause) && now.getTime() - new Date(pause.since).getTime() > thresholds.pauseMs;
    return [
      ...snapshot.installation.pauses.filter(lasting).map((pause) => blockerOf(pause, null)),
      ...snapshot.projects.flatMap((project) => project.pauses.filter(lasting).map((pause) => blockerOf(pause, project.id))),
    ];
  },
};
