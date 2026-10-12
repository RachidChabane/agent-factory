import { admitAgentRun, FILM_SCENARIO_RULE, isFilmScenarioName, textDocument } from '@agent-factory/domain';
import type { ResourceAdmissionPolicy, ScanDocument } from '@agent-factory/domain';
import { filmsCommitMessage } from '../pipeline/conventional-commit.ts';
import { FILM_PHASES, PIPELINE_EVENTS, type FilmFinishedRecord, type FilmPhase, type FilmPhaseRecord } from '../pipeline/journal-events.ts';
import { IssueJournalWriter } from '../pipeline/journal-writer.ts';
import { OutboundSecretScan } from '../pipeline/outbound-secret-scan.ts';
import type { PipelineDependencies } from '../pipeline/pipeline-dependencies.ts';
import { loadJournal, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { ForgeFileLinks } from '../pipeline/pipeline-settings.ts';
import type { PullRequestRef, Worktree } from '../ports.ts';
import type { AgentRunActivity } from '../runs/run-activity.ts';
import type { FilmBodies } from './film-bodies.ts';
import { FilmBodyUpdateError, FilmDeferredError, FilmRecordingError, FilmRefusedError } from './film-errors.ts';
import {
  extensionOf,
  filmBranchReport,
  filmBranchScreenshot,
  filmBranchVideo,
  filmPhasePath,
  filmStoreFile,
  filmStoreRoot,
  isMp4,
  transcodedVideoPath,
} from './film-layout.ts';
import type { FilmOrder } from './film-order.ts';
import { requireFilmSubject } from './film-pending.ts';
import { FILM_REPORT_FILE, type FilmRecorder, type FilmRecording, type VideoTranscoder } from './film-ports.ts';
import type { FilmQueue } from './film-queue.ts';
import { renderFinishedFilm } from './film-section.ts';

const PATH_SEPARATOR = '/';
const NORMAL_PRESSURE_ONLY: Pick<ResourceAdmissionPolicy, 'pauseAbovePressure'> = { pauseAbovePressure: 'normal' };
const STOPPED_REASON = 'the film was stopped before it finished';
/** Screenshots in these formats are text, so the secret scan reads them like the reports. */
const TEXT_IMAGE_EXTENSIONS: readonly string[] = ['.svg'];

export type FilmBehaviourDependencies = Pick<
  PipelineDependencies,
  'github' | 'pool' | 'sourceControl' | 'events' | 'states' | 'files' | 'resources' | 'knownSecrets'
> & {
  readonly recorder: FilmRecorder;
  readonly transcoder: VideoTranscoder;
  readonly queue: FilmQueue;
  readonly bodies: FilmBodies;
  readonly activity: AgentRunActivity;
};

export interface FilmBehaviourSettings {
  readonly fileLinks: ForgeFileLinks;
  readonly evidenceCacheDirectory: string;
  readonly resources: ResourceAdmissionPolicy;
  /** The file the base recording must write for the head recording to replay it; null when the command replays nothing. */
  readonly replayFile: string | null;
}

/** What a film is recorded against: the pull request, its worktree and the commits to film. */
export interface FilmTarget {
  readonly journal: PipelineJournal;
  readonly worktree: Worktree;
  readonly pullRequest: PullRequestRef;
  readonly headSha: string;
  /** The head the code has, without the commits earlier films added. */
  readonly filmedHeadSha: string;
  readonly unpublishedHead: boolean;
}

export type FilmOutcome =
  | {
      readonly kind: 'finished';
      readonly issueNumber: number;
      readonly pullRequestNumber: number;
      readonly scenario: string;
      readonly commitSha: string;
      readonly before: FilmPhaseRecord;
      readonly after: FilmPhaseRecord;
    }
  | { readonly kind: 'failed'; readonly issueNumber: number; readonly scenario: string; readonly reason: string };

interface FilmFileCopy {
  readonly from: string;
  readonly to: string;
  readonly isText: boolean;
}

interface CapturedPhase {
  readonly phase: FilmPhase;
  readonly recording: FilmRecording;
  /** The MP4 of the phase in the film store, relative to the store root. */
  readonly storeVideo: string;
}

/** The head of the code: the head, less the commits that earlier films added on top of it. */
function codeHeadOf(films: readonly FilmFinishedRecord[], headSha: string): string {
  let head = headSha;
  for (let film = films.find((candidate) => candidate.commitSha === head); film !== undefined; film = films.find((candidate) => candidate.commitSha === head)) {
    head = film.headSha;
  }
  return head;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTextImage(path: string): boolean {
  return TEXT_IMAGE_EXTENSIONS.includes(extensionOf(path));
}

/**
 * Films one scenario of an open pull request: records the issue's base commit, then its head,
 * commits both recordings on the branch and records the new head. A film that fails leaves the
 * worktree clean and nothing pushed beyond what was already.
 */
export class FilmBehaviour {
  private readonly dependencies: FilmBehaviourDependencies;
  private readonly settings: FilmBehaviourSettings;
  private readonly storeRoot: (issueNumber: number) => string;

  constructor(dependencies: FilmBehaviourDependencies, settings: FilmBehaviourSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
    this.storeRoot = (issueNumber) => filmStoreRoot(settings.evidenceCacheDirectory, issueNumber);
  }

  /** Checks that the film can start now. A deferral means it waits; any other refusal means it cannot be filmed. */
  async prepare(order: FilmOrder): Promise<FilmTarget> {
    if (!isFilmScenarioName(order.scenario)) {
      throw new FilmRefusedError(order.issueNumber, `the scenario name must be ${FILM_SCENARIO_RULE}`);
    }
    if (await this.dependencies.activity.hasOpenRun()) {
      throw new FilmDeferredError(order.issueNumber, 'agent-run', 'an agent run is active; films wait until it ends');
    }
    await this.assertResources(order.issueNumber);
    return this.inspect(order.issueNumber, null);
  }

  async film(order: FilmOrder, signal: AbortSignal): Promise<FilmOutcome> {
    const target = await this.prepare(order);
    const { events, states, queue } = this.dependencies;
    const writer = new IssueJournalWriter(events, states, order.issueNumber);
    await queue.ensureQueued(order, target.journal);
    if (target.unpublishedHead) {
      await this.dependencies.sourceControl.push(target.worktree);
      await writer.record(PIPELINE_EVENTS.filmPushed, { headSha: target.headSha });
    }
    await writer.record(PIPELINE_EVENTS.filmStarted, {
      scenario: order.scenario,
      operator: order.operator,
      baseSha: target.worktree.baseSha,
      headSha: target.filmedHeadSha,
    });
    await this.dependencies.bodies.refreshAll();
    const outcome = await this.record(order, target, writer, signal);
    await this.refreshBodies(order.issueNumber);
    return outcome;
  }

  private async record(order: FilmOrder, target: FilmTarget, writer: IssueJournalWriter, signal: AbortSignal): Promise<FilmOutcome> {
    try {
      return await this.perform(order, target, writer, signal);
    } catch (error) {
      const reason = signal.aborted ? STOPPED_REASON : describe(error);
      await writer.record(PIPELINE_EVENTS.filmFailed, { scenario: order.scenario, reason });
      return { kind: 'failed', issueNumber: order.issueNumber, scenario: order.scenario, reason };
    }
  }

  private async refreshBodies(issueNumber: number): Promise<void> {
    const refresh = await this.dependencies.bodies.refreshAll();
    const own = refresh.failed.find((failure) => failure.issueNumber === issueNumber);
    if (own !== undefined) throw new FilmBodyUpdateError(issueNumber, own.reason);
  }

  private async inspect(issueNumber: number, expectedHeadSha: string | null): Promise<FilmTarget> {
    const { events, github, pool, sourceControl } = this.dependencies;
    const journal = await loadJournal(events, issueNumber);
    const { pullRequest: recordedPullRequest, worktree: recorded } = requireFilmSubject(journal);
    const worktree = await pool.reattach(issueNumber, recorded, journal.lastCommitSha ?? recorded.baseSha);
    if (worktree === null) throw new FilmRefusedError(issueNumber, `the worktree at ${recorded.path} is no longer leased on its branch`);
    const pullRequest = await github.findOpenPullRequest(worktree.branch);
    if (pullRequest === null || pullRequest.number !== recordedPullRequest.number) {
      throw new FilmRefusedError(issueNumber, `no open pull request on ${worktree.branch}`);
    }
    const headSha = await sourceControl.headSha(worktree);
    const unpublishedHead = headSha !== pullRequest.headSha && headSha === journal.lastCommitSha && pullRequest.headSha === journal.pushedHead;
    if (headSha !== pullRequest.headSha && !unpublishedHead) {
      throw new FilmRefusedError(issueNumber, `the head is ${pullRequest.headSha} on the forge and ${headSha} locally`);
    }
    if (expectedHeadSha !== null && headSha !== expectedHeadSha) {
      throw new FilmRefusedError(issueNumber, `the head moved from ${expectedHeadSha} to ${headSha} while the film ran`);
    }
    if (!(await sourceControl.isClean(worktree))) throw new FilmRefusedError(issueNumber, 'its worktree has uncommitted changes');
    return { journal, worktree, pullRequest, headSha, filmedHeadSha: codeHeadOf(journal.films, headSha), unpublishedHead };
  }

  private async assertResources(issueNumber: number): Promise<void> {
    const admission = admitAgentRun(await this.dependencies.resources.snapshot(), { ...this.settings.resources, ...NORMAL_PRESSURE_ONLY });
    if (!admission.admitted) throw new FilmDeferredError(issueNumber, 'resources', `machine resources are short: ${admission.reason}`);
  }

  private async perform(order: FilmOrder, target: FilmTarget, writer: IssueJournalWriter, signal: AbortSignal): Promise<FilmOutcome> {
    const { issueNumber, scenario } = order;
    const { files, sourceControl } = this.dependencies;
    const root = this.storeRoot(issueNumber);
    for (const phase of FILM_PHASES) await files.remove(root, filmPhasePath(scenario, phase));
    const before = await this.capture(order, 'before', target.worktree.baseSha, signal);
    await writer.record(PIPELINE_EVENTS.filmStageEntered, { scenario, stage: 'recording-head' });
    const after = await this.capture(order, 'after', target.filmedHeadSha, signal);
    await writer.record(PIPELINE_EVENTS.filmStageEntered, { scenario, stage: 'committing' });
    await this.inspect(issueNumber, target.headSha);
    const copies = this.filmFiles(order, [before, after]);
    const documents = await this.textDocuments(order, copies);
    const announced = renderFinishedFilm(this.settings.fileLinks, this.finishedRecord(order, target, target.headSha, before, after));
    await new OutboundSecretScan(this.dependencies.knownSecrets).assertClean({ documents, body: announced }, `commit the films of #${issueNumber}`);
    const commitSha = await this.commitCopies(order, target.worktree, copies);
    await writer.record(PIPELINE_EVENTS.filmCommitted, { scenario, sha: commitSha });
    await sourceControl.push(target.worktree);
    await writer.record(PIPELINE_EVENTS.filmPushed, { headSha: commitSha });
    const finished = this.finishedRecord(order, target, commitSha, before, after);
    await writer.record(PIPELINE_EVENTS.filmFinished, finished);
    return {
      kind: 'finished',
      issueNumber,
      pullRequestNumber: target.pullRequest.number,
      scenario,
      commitSha,
      before: finished.before,
      after: finished.after,
    };
  }

  private async capture(order: FilmOrder, phase: FilmPhase, ref: string, signal: AbortSignal): Promise<CapturedPhase> {
    const { recorder } = this.dependencies;
    await this.assertResources(order.issueNumber);
    const root = this.storeRoot(order.issueNumber);
    const outputDirectory = `${root}${PATH_SEPARATOR}${filmPhasePath(order.scenario, phase)}`;
    const { replayFile } = this.settings;
    const replayPath = phase === 'after' && replayFile !== null ? `${root}${PATH_SEPARATOR}${filmStoreFile(order.scenario, 'before', replayFile)}` : null;
    const recording = await recorder.record({ ref, outputDirectory, scenario: order.scenario, replayPath }, signal);
    if (phase === 'before' && replayFile !== null && !recording.wroteReplay) {
      throw new FilmRecordingError(`the base recording wrote no ${replayFile}, so the head recording cannot replay it`);
    }
    return { phase, recording, storeVideo: await this.mp4Of(order, phase, outputDirectory, recording.videoPath, signal) };
  }

  /** The MP4 of a phase: the video itself when it is one, its H.264 transcoding otherwise. */
  private async mp4Of(order: FilmOrder, phase: FilmPhase, outputDirectory: string, videoPath: string, signal: AbortSignal): Promise<string> {
    if (isMp4(videoPath)) return filmStoreFile(order.scenario, phase, videoPath);
    const target = transcodedVideoPath(videoPath);
    await this.dependencies.transcoder.toMp4(`${outputDirectory}${PATH_SEPARATOR}${videoPath}`, `${outputDirectory}${PATH_SEPARATOR}${target}`, signal);
    return filmStoreFile(order.scenario, phase, target);
  }

  private filmFiles(order: FilmOrder, phases: readonly CapturedPhase[]): readonly FilmFileCopy[] {
    const { issueNumber, scenario } = order;
    return phases.flatMap(({ phase, recording, storeVideo }) => [
      { from: storeVideo, to: filmBranchVideo(issueNumber, scenario, phase), isText: false },
      { from: filmStoreFile(scenario, phase, FILM_REPORT_FILE), to: filmBranchReport(issueNumber, scenario, phase), isText: true },
      ...recording.screenshotPaths.map((path, position) => ({
        from: filmStoreFile(scenario, phase, path),
        to: filmBranchScreenshot(issueNumber, scenario, phase, position, path),
        isText: isTextImage(path),
      })),
    ]);
  }

  private async textDocuments(order: FilmOrder, copies: readonly FilmFileCopy[]): Promise<readonly ScanDocument[]> {
    const root = this.storeRoot(order.issueNumber);
    const documents: ScanDocument[] = [];
    for (const copy of copies.filter((candidate) => candidate.isText)) {
      const text = await this.dependencies.files.readText(root, copy.from);
      if (text === null) throw new FilmRecordingError(`${copy.from} is missing from the film store`);
      documents.push(textDocument(copy.to, text));
    }
    return documents;
  }

  private async copyIntoWorktree(order: FilmOrder, worktree: Worktree, copies: readonly FilmFileCopy[]): Promise<void> {
    const root = this.storeRoot(order.issueNumber);
    for (const copy of copies) {
      if (!(await this.dependencies.files.copyFile(root, copy.from, worktree.path, copy.to))) {
        throw new FilmRecordingError(`${copy.from} is missing from the film store`);
      }
    }
  }

  /** Commits the copies, or restores the worktree to what it was when any step fails. */
  private async commitCopies(order: FilmOrder, worktree: Worktree, copies: readonly FilmFileCopy[]): Promise<string> {
    const { sourceControl } = this.dependencies;
    const paths = copies.map((copy) => copy.to);
    try {
      await this.copyIntoWorktree(order, worktree, copies);
      if (await sourceControl.isClean(worktree)) return await sourceControl.headSha(worktree);
      return await sourceControl.commitPaths(worktree, paths, filmsCommitMessage(order.issueNumber, order.scenario));
    } catch (error) {
      await sourceControl.discardPaths(worktree, paths);
      throw error;
    }
  }

  private finishedRecord(order: FilmOrder, target: FilmTarget, commitSha: string, before: CapturedPhase, after: CapturedPhase): FilmFinishedRecord {
    const { issueNumber, scenario } = order;
    const phaseRecord = ({ phase, recording, storeVideo }: CapturedPhase): FilmPhaseRecord => ({
      video: filmBranchVideo(issueNumber, scenario, phase),
      report: filmBranchReport(issueNumber, scenario, phase),
      screenshots: recording.screenshotPaths.map((path, position) => filmBranchScreenshot(issueNumber, scenario, phase, position, path)),
      facts: [...recording.facts],
      storeVideo,
      storeScreenshots: recording.screenshotPaths.map((path) => filmStoreFile(scenario, phase, path)),
    });
    return { scenario, baseSha: target.worktree.baseSha, headSha: target.filmedHeadSha, commitSha, before: phaseRecord(before), after: phaseRecord(after) };
  }
}
