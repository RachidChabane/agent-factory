import type { ReadyHoldView, ReadyNoticeView } from '@agent-factory/cockpit';
import {
  currentHeadOf,
  failedFilmScenarios,
  isAwaitingMerge,
  pendingFilmScenarios,
  requiredChecksVerdict,
  type CheckRunSummary,
  type PipelineJournal,
  type ReadyAnnouncement,
} from '@agent-factory/application';
import { evaluatePullRequestReadiness, type ReadinessBlocker } from '@agent-factory/domain';
import { iso } from './event-index.ts';
import type { Observed } from '../snapshot/cached-reading.ts';

function holdView(blocker: ReadinessBlocker): ReadyHoldView {
  return blocker.kind === 'films-pending' || blocker.kind === 'films-failed' ? { kind: blocker.kind, scenarios: [...blocker.scenarios] } : { kind: blocker.kind };
}

function sentView(announcement: ReadyAnnouncement): ReadyNoticeView {
  return {
    status: 'sent',
    sentAt: announcement.announcedAt,
    headSha: announcement.headSha,
    links: announcement.links.map(({ label, url }) => ({ label, url })),
    failures: announcement.failures.map(({ label, reason }) => ({ label, reason })),
  };
}

export interface ReadyNoticeReadings {
  /** The checks of the head of the pull request, as last read from the forge. */
  readonly checks: Observed<readonly CheckRunSummary[]>;
  /** The checks of the base branch, against which a failure the change did not cause is told apart. */
  readonly baseChecks: Observed<readonly CheckRunSummary[]>;
  /** Whether the project films: a film its specs declare only holds a pull request when it can be recorded. */
  readonly filming: boolean;
}

/**
 * The ready notice of a pull request: sent for the head it has now, held by what the factory waits for, or due at its next
 * tick. A merged or closed pull request keeps the last notice it got; one that no cycle is waiting at has none to show.
 */
export function readyNoticeView(journal: PipelineJournal, open: boolean, readings: ReadyNoticeReadings): ReadyNoticeView {
  const head = currentHeadOf(journal);
  const latest = journal.readyAnnouncements.at(-1);
  if (!open) return latest === undefined ? { status: 'none' } : sentView(latest);
  if (!isAwaitingMerge(journal) || head === null) return { status: 'none' };
  const current = journal.readyAnnouncements.findLast((announcement) => announcement.headSha === head);
  if (current !== undefined) return sentView(current);
  const films = readings.filming;
  const readiness = evaluatePullRequestReadiness({
    checks: requiredChecksVerdict(readings.checks.value ?? [], readings.baseChecks.value ?? [], false),
    pendingFilms: films ? pendingFilmScenarios(journal) : [],
    failedFilms: films ? failedFilmScenarios(journal) : [],
  });
  if (readiness.ready) return { status: 'due' };
  const [first, ...others] = readiness.blockers.map(holdView);
  return first === undefined ? { status: 'due' } : { status: 'held', holds: [first, ...others], checksReadAt: readings.checks.readAt === null ? null : iso(readings.checks.readAt) };
}
