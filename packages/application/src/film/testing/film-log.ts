import { ISSUE_TRANSITIONED_EVENT, issueSubject, type IssueState } from '@agent-factory/domain';
import { InMemoryEventStore } from '../../audit/testing/fakes.ts';
import { PIPELINE_EVENTS } from '../../pipeline/journal-events.ts';
import { SPEC } from '../../pipeline/testing/pipeline-scenario.ts';
import { ProjectEventStore } from '../../projects/project-event-store.ts';
import { SteppingClock } from '../../runs/test-support.ts';
import type { FilmProjectLog } from '../film-ledger.ts';
import { MINUTE_MS } from './film-fakes.ts';

export const LOG_START = new Date('2026-10-12T12:00:00.000Z');
const BASE_SHA = 'base0000';

/** An installation's log in which projects have issues with open pull requests and films in every state. */
export class FilmLog {
  readonly clock = new SteppingClock(LOG_START);
  readonly installation = new InMemoryEventStore(this.clock);
  private readonly pullRequests = new Map<string, number>();

  project(projectId: string): ProjectEventStore {
    return new ProjectEventStore(this.installation, projectId);
  }

  logs(...projectIds: readonly string[]): readonly FilmProjectLog[] {
    return projectIds.map((projectId) => ({ projectId, events: this.project(projectId) }));
  }

  advance(minutes: number): void {
    this.clock.set(new Date(this.clock.now().getTime() + minutes * MINUTE_MS));
  }

  /** An issue whose pull request is open; `declared` are the scenarios its spec asks to film. */
  async openPullRequest(projectId: string, issueNumber: number, declared: readonly string[] = [], state: IssueState = 'pr-open'): Promise<void> {
    const events = this.project(projectId);
    const subject = issueSubject(issueNumber);
    await events.append(ISSUE_TRANSITIONED_EVENT, subject, { from: null, to: state, reason: 'test' });
    await events.append(PIPELINE_EVENTS.specCaptured, subject, { spec: { ...SPEC, number: issueNumber, films: [...declared] }, branch: `factory/${issueNumber}-film` });
    await events.append(PIPELINE_EVENTS.worktreeAcquired, subject, { path: `/pool/${projectId}-${issueNumber}`, branch: `factory/${issueNumber}-film`, baseSha: BASE_SHA });
    const number = 100 + issueNumber;
    this.pullRequests.set(`${projectId}/${issueNumber}`, number);
    await events.append(PIPELINE_EVENTS.pullRequestOpened, subject, { number, url: `https://forge.example.test/pull/${number}`, headSha: 'head0000' });
  }

  queue(projectId: string, issueNumber: number, scenario: string, operator = 'operator'): Promise<unknown> {
    return this.project(projectId).append(PIPELINE_EVENTS.filmQueued, issueSubject(issueNumber), { scenario, operator });
  }

  start(projectId: string, issueNumber: number, scenario: string, operator = 'operator'): Promise<unknown> {
    return this.project(projectId).append(PIPELINE_EVENTS.filmStarted, issueSubject(issueNumber), { scenario, operator, baseSha: BASE_SHA, headSha: 'head0000' });
  }

  stage(projectId: string, issueNumber: number, scenario: string, stage: 'recording-base' | 'recording-head' | 'committing'): Promise<unknown> {
    return this.project(projectId).append(PIPELINE_EVENTS.filmStageEntered, issueSubject(issueNumber), { scenario, stage });
  }

  finish(projectId: string, issueNumber: number, scenario: string): Promise<unknown> {
    const phase = (name: string) => ({
      video: `.evidence/${issueNumber}/films/${scenario}/${name}.mp4`,
      report: `.evidence/${issueNumber}/films/${scenario}/${name}-report.json`,
      screenshots: [],
      facts: [],
      storeVideo: `films/${scenario}/${name}/film.mp4`,
      storeScreenshots: [],
    });
    return this.project(projectId).append(PIPELINE_EVENTS.filmFinished, issueSubject(issueNumber), {
      scenario,
      baseSha: BASE_SHA,
      headSha: 'head0000',
      commitSha: 'films000',
      before: phase('before'),
      after: phase('after'),
    });
  }

  fail(projectId: string, issueNumber: number, scenario: string, reason = 'the scenario failed'): Promise<unknown> {
    return this.project(projectId).append(PIPELINE_EVENTS.filmFailed, issueSubject(issueNumber), { scenario, reason });
  }

  pullRequestNumber(projectId: string, issueNumber: number): number {
    return this.pullRequests.get(`${projectId}/${issueNumber}`) ?? 0;
  }
}
