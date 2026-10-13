import { describe, expect, it } from 'vitest';
import { issueSubject, ISSUE_TRANSITIONED_EVENT, type IssueState } from '@agent-factory/domain';
import type { FactoryEventRecord } from '../ports.ts';
import { RUN_FINISHED_EVENT, RUN_STARTED_EVENT, runSubject, type RunStartedPayload } from '../runs/run-events.ts';
import { FilmLog } from '../film/testing/film-log.ts';
import { setIssuePaused } from './issue-pause.ts';
import { restartHazards, type RestartWorld } from './restart-hazards.ts';

const STARTED_AT = '2026-10-12T11:50:00.000Z';

function runStarted(id: string, overrides: Partial<RunStartedPayload> = {}): RunStartedPayload {
  return {
    id,
    project: 'storefront',
    role: 'implementer',
    model: 'opus',
    effort: 'high',
    status: 'running',
    outcome: null,
    subject: { kind: 'issue', id: '12' },
    attempt: 0,
    currentTool: null,
    branch: null,
    startedAt: STARTED_AT,
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0,
    turns: 0,
    maxTurns: 40,
    maxBudgetUsd: 5,
    lastLine: null,
    logLength: 0,
    subagents: [],
    pendingQuestion: null,
    account: null,
    ...overrides,
  };
}

async function worldOf(log: FilmLog, ...projects: readonly string[]): Promise<RestartWorld> {
  return {
    installation: await log.installation.read('', 0),
    projects: new Map(await Promise.all(projects.map(async (project): Promise<[string, readonly FactoryEventRecord[]]> => [project, await log.project(project).read('', 0)]))),
  };
}

async function transition(log: FilmLog, project: string, issueNumber: number, to: IssueState): Promise<void> {
  await log.project(project).append(ISSUE_TRANSITIONED_EVENT, issueSubject(issueNumber), { from: null, to, reason: 'test' });
}

describe('what a restart would cut short', () => {
  it('finds nothing in a factory that has no work in flight', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'waiting');
    await log.queue('storefront', 1, 'done');
    await log.start('storefront', 1, 'done');
    await log.finish('storefront', 1, 'done');
    await log.queue('storefront', 1, 'broken');
    await log.fail('storefront', 1, 'broken');
    expect(await restartHazards(await worldOf(log, 'storefront'))).toEqual([]);
  });

  it('finds an agent run that is open, with its project, role, subject and start, and not one that ended', async () => {
    const log = new FilmLog();
    await log.installation.append(RUN_STARTED_EVENT, runSubject('r1'), runStarted('r1'));
    await log.installation.append(RUN_STARTED_EVENT, runSubject('r2'), runStarted('r2', { role: 'auditor', project: null, subject: { kind: 'audit', id: 'abc1234' } }));
    await log.installation.append(RUN_FINISHED_EVENT, runSubject('r2'), {});
    expect(await restartHazards(await worldOf(log))).toEqual([
      { kind: 'agent-run', project: 'storefront', role: 'implementer', subject: 'issue 12', startedAt: new Date(STARTED_AT) },
    ]);
  });

  it('finds a film that is recording, with its stage, and not a film that waits, ended or failed', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'recording');
    await log.start('storefront', 1, 'recording');
    await log.stage('storefront', 1, 'recording', 'recording-head');
    await log.queue('storefront', 1, 'waiting');
    expect(await restartHazards(await worldOf(log, 'storefront'))).toEqual([
      { kind: 'film-recording', project: 'storefront', issueNumber: 1, scenario: 'recording', stage: 'recording-head' },
    ]);
  });

  it.each(['checks-frozen', 'gating', 'producing-evidence'] as const)('finds an issue the factory works on by itself while it is %s', async (state) => {
    const log = new FilmLog();
    await transition(log, 'storefront', 14, state);
    expect(await restartHazards(await worldOf(log, 'storefront'))).toEqual([{ kind: 'deterministic-stage', project: 'storefront', issueNumber: 14, state }]);
  });

  it.each(['spec-validated', 'authoring-checks', 'implementing', 'reviewing', 'pr-open', 'needs-human', 'closed'] as const)(
    'finds no deterministic work in an issue that is %s: an agent run, if any, is found as such',
    async (state) => {
      const log = new FilmLog();
      await transition(log, 'storefront', 14, state);
      expect(await restartHazards(await worldOf(log, 'storefront'))).toEqual([]);
    },
  );

  it('does not count an issue the operator paused, until it is started again', async () => {
    const log = new FilmLog();
    await transition(log, 'storefront', 14, 'gating');
    await setIssuePaused(log.project('storefront'), 14, true, 'paused by Alex Morgan');
    expect(await restartHazards(await worldOf(log, 'storefront'))).toEqual([]);
    await setIssuePaused(log.project('storefront'), 14, false, 'started by Alex Morgan');
    expect(await restartHazards(await worldOf(log, 'storefront'))).toHaveLength(1);
  });

  it('tells the issues of each project apart, whatever number they share', async () => {
    const log = new FilmLog();
    await transition(log, 'storefront', 14, 'gating');
    await transition(log, 'ledger', 14, 'implementing');
    await transition(log, 'ledger', 15, 'producing-evidence');
    expect(await restartHazards(await worldOf(log, 'storefront', 'ledger'))).toEqual([
      { kind: 'deterministic-stage', project: 'storefront', issueNumber: 14, state: 'gating' },
      { kind: 'deterministic-stage', project: 'ledger', issueNumber: 15, state: 'producing-evidence' },
    ]);
  });
});
