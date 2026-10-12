import { ISSUE_SUBJECT_PREFIX } from '@agent-factory/domain';
import { EVIDENCE_DIRECTORY } from '../acceptance/acceptance-manifest.ts';
import { authorOf, delegationFields, type Delegation } from '../autonomy/delegation.ts';
import type { CheckConclusion, CheckRunSummary, EventStore, Worktree } from '../ports.ts';
import type { FilmMergeGuard } from '../film/film-merge-guard.ts';
import { evidenceRemovalCommitMessage } from './conventional-commit.ts';
import { PIPELINE_EVENTS, PullRequestOpenedSchema } from './journal-events.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { MergeRefusedError, PullRequestNotFromFactoryError, WorktreeUnavailableError } from './pipeline-errors.ts';
import { MERGEABLE_STATES } from './mergeable-states.ts';
import { loadJournal, type PipelineJournal } from './pipeline-journal.ts';

export { MERGEABLE_STATES };

const FIRST_SEQUENCE = 0;
const ISSUE_NUMBER_PATTERN = new RegExp(`^${ISSUE_SUBJECT_PREFIX}(\\d+)$`);
const REFUSED_CONCLUSIONS: readonly CheckConclusion[] = ['failure', 'cancelled'];
const PENDING_CONCLUSION: CheckConclusion = 'pending';

function isRefused(check: CheckRunSummary): boolean {
  return REFUSED_CONCLUSIONS.includes(check.conclusion);
}

/** The failing checks of a head that also fail on the base branch: failures the change did not cause. */
export function failingOnBase(checks: readonly CheckRunSummary[], baseChecks: readonly CheckRunSummary[]): ReadonlySet<string> {
  const failedOnBase = new Set(baseChecks.filter(isRefused).map((check) => check.name));
  return new Set(checks.filter((check) => isRefused(check) && failedOnBase.has(check.name)).map((check) => check.name));
}

/** The checks of a head that keep it from merging: the ones that fail and the ones still running. */
export interface MergeCheckProblems {
  readonly failing: readonly CheckRunSummary[];
  readonly pending: readonly CheckRunSummary[];
}

/**
 * The checks of a head that block its merge. A check that fails the same way on the base branch was
 * failing before the change, so it does not block; a pending one does, until it ends.
 */
export function mergeCheckProblems(checks: readonly CheckRunSummary[], baseChecks: readonly CheckRunSummary[] = []): MergeCheckProblems {
  const preExisting = failingOnBase(checks, baseChecks);
  return {
    failing: checks.filter((check) => isRefused(check) && !preExisting.has(check.name)),
    pending: checks.filter((check) => check.conclusion === PENDING_CONCLUSION),
  };
}

/** Why the checks of a head block its merge, or null. */
export function checksBlockingMerge(checks: readonly CheckRunSummary[], baseChecks: readonly CheckRunSummary[] = []): string | null {
  const { failing, pending } = mergeCheckProblems(checks, baseChecks);
  if (failing.length > 0) return `checks failed: ${describeChecks(failing)}`;
  return pending.length > 0 ? `checks still running: ${describeChecks(pending)}` : null;
}

export type MergeOnOrderDependencies = Pick<
  PipelineDependencies,
  'github' | 'pool' | 'sourceControl' | 'events' | 'states' | 'files'
>;

export interface MergeOrder {
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
  /** The delegate making the gesture; absent when the operator orders the merge themselves. */
  readonly delegation?: Delegation;
}

export interface MergeOutcome {
  readonly issueNumber: number;
  readonly pullRequestNumber: number;
  readonly mergeSha: string;
}

export async function issueOfPullRequest(events: EventStore, pullRequestNumber: number): Promise<number> {
  const opened = (await events.read(ISSUE_SUBJECT_PREFIX, FIRST_SEQUENCE)).filter(
    (event) => event.type === PIPELINE_EVENTS.pullRequestOpened && PullRequestOpenedSchema.safeParse(event.payload).data?.number === pullRequestNumber,
  );
  const issueNumber = Number(ISSUE_NUMBER_PATTERN.exec(opened.at(-1)?.subject ?? '')?.[1]);
  if (!Number.isInteger(issueNumber)) throw new PullRequestNotFromFactoryError(pullRequestNumber);
  return issueNumber;
}

function describeChecks(checks: readonly CheckRunSummary[]): string {
  return checks.map((check) => `${check.name} (${check.conclusion})`).join(', ');
}

export class MergeOnOrder {
  private readonly dependencies: MergeOnOrderDependencies;
  private readonly films: FilmMergeGuard | null;

  /** `films` holds the merge while a film of the pull request is queued or recording; null when the project films nothing. */
  constructor(dependencies: MergeOnOrderDependencies, films: FilmMergeGuard | null = null) {
    this.dependencies = dependencies;
    this.films = films;
  }

  async merge(order: MergeOrder): Promise<MergeOutcome> {
    const { events, states } = this.dependencies;
    const issueNumber = await issueOfPullRequest(events, order.pullRequestNumber);
    const writer = new IssueJournalWriter(events, states, issueNumber);
    let journal = await loadJournal(events, issueNumber);
    if (journal.mergeSha !== null) return { issueNumber, pullRequestNumber: order.pullRequestNumber, mergeSha: journal.mergeSha };
    if (journal.state === null || !MERGEABLE_STATES.includes(journal.state)) {
      throw new MergeRefusedError(order.pullRequestNumber, `issue #${issueNumber} is ${journal.state ?? 'unknown'}, not awaiting a merge`);
    }
    const filmBlocker = this.films === null ? null : await this.films.blockerOf(journal);
    if (filmBlocker !== null) throw new MergeRefusedError(order.pullRequestNumber, filmBlocker);
    const worktree = await this.worktreeOf(journal);
    if (journal.evidenceRemoval === null) {
      await this.removeEvidence(order, journal, worktree, writer);
      journal = await loadJournal(events, issueNumber);
    } else if (journal.evidenceRemoval.reviewedHeadSha !== order.expectedHeadSha) {
      throw new MergeRefusedError(
        order.pullRequestNumber,
        `the merge was already prepared for head ${journal.evidenceRemoval.reviewedHeadSha}, not ${order.expectedHeadSha}`,
      );
    }
    const removal = journal.evidenceRemoval;
    if (removal === null) throw new MergeRefusedError(order.pullRequestNumber, 'the evidence removal was not recorded');
    await this.dependencies.sourceControl.push(worktree);
    await this.advanceTo(journal, writer, order);
    const mergeSha = await this.dependencies.github.squashMerge(order.pullRequestNumber, removal.headSha);
    await writer.record(PIPELINE_EVENTS.pullRequestMerged, { mergeSha, ...delegationFields(order.delegation ?? null) });
    await writer.transition('merged', `pull request #${order.pullRequestNumber} squash-merged as ${mergeSha}`);
    await this.dependencies.pool.release(worktree);
    await writer.record(PIPELINE_EVENTS.worktreeReleased, { path: worktree.path });
    return { issueNumber, pullRequestNumber: order.pullRequestNumber, mergeSha };
  }

  private async worktreeOf(journal: PipelineJournal): Promise<Worktree> {
    const recorded = journal.worktree;
    if (recorded === null) throw new WorktreeUnavailableError('(released)');
    const worktree = await this.dependencies.pool.reattach(journal.issueNumber, recorded, journal.lastCommitSha ?? recorded.baseSha);
    if (worktree === null) throw new WorktreeUnavailableError(recorded.path);
    return worktree;
  }

  private async removeEvidence(order: MergeOrder, journal: PipelineJournal, worktree: Worktree, writer: IssueJournalWriter): Promise<void> {
    const { github, sourceControl, files } = this.dependencies;
    const branch = worktree.branch;
    const pullRequest = await github.findOpenPullRequest(branch);
    if (pullRequest === null || pullRequest.number !== order.pullRequestNumber) {
      throw new MergeRefusedError(order.pullRequestNumber, `no open pull request on ${branch}`);
    }
    const localHead = await sourceControl.headSha(worktree);
    if (pullRequest.headSha !== order.expectedHeadSha || localHead !== order.expectedHeadSha) {
      throw new MergeRefusedError(
        order.pullRequestNumber,
        `the head is ${pullRequest.headSha} on GitHub and ${localHead} locally, not the expected ${order.expectedHeadSha}`,
      );
    }
    await this.assertChecksGreen(order);
    let headSha = order.expectedHeadSha;
    if (await files.exists(worktree.path, EVIDENCE_DIRECTORY)) {
      await files.remove(worktree.path, EVIDENCE_DIRECTORY);
      headSha = await sourceControl.commitAll(worktree, evidenceRemovalCommitMessage(journal.issueNumber));
    }
    await writer.record(PIPELINE_EVENTS.evidenceRemoved, { reviewedHeadSha: order.expectedHeadSha, headSha });
  }

  private async assertChecksGreen(order: MergeOrder): Promise<void> {
    const { github } = this.dependencies;
    const blocking = checksBlockingMerge(await github.checks(order.expectedHeadSha), await github.baseBranchChecks());
    if (blocking !== null) throw new MergeRefusedError(order.pullRequestNumber, blocking);
  }

  private async advanceTo(journal: PipelineJournal, writer: IssueJournalWriter, order: MergeOrder): Promise<void> {
    if (journal.state === 'pr-open') {
      await writer.transition('ci', `checks on ${order.expectedHeadSha} are green`);
    }
    if (journal.state === 'pr-open' || journal.state === 'ci') {
      await writer.transition('ready-to-merge', `${authorOf(order.delegation ?? null)} ordered the merge of ${order.expectedHeadSha}`);
    }
  }
}
