import { describe, expect, it } from 'vitest';
import { CockpitSnapshotSchema } from '@agent-factory/cockpit';
import { WorktreeAcquiredSchema } from '@agent-factory/application';
import { projectSnapshot } from './snapshot.ts';
import { proofLogExcerpt } from './pull-request-views.ts';
import { fixtureContext, fixtureEvents } from './snapshot-fixture.ts';

describe('cockpit snapshot projection', () => {
  const snapshot = projectSnapshot(fixtureEvents(), fixtureContext());

  it('produces a snapshot the cockpit contract accepts', () => {
    expect(CockpitSnapshotSchema.safeParse(snapshot).error?.issues ?? []).toEqual([]);
  });

  it('matches the golden snapshot', async () => {
    await expect(`${JSON.stringify(snapshot, null, 2)}\n`).toMatchFileSnapshot('./__fixtures__/snapshot.golden.json');
  });

  it('shows the tokens and turns a running agent has used so far', () => {
    const running = fixtureEvents().filter((record) => !(record.type === 'run.finished' && record.subject === 'run/run-reviewer'));
    const progress = { usage: { inputTokens: 40, outputTokens: 900, cacheReadTokens: 12_000, cacheCreationTokens: 3_000 }, turns: 6 };
    const context = { ...fixtureContext(), runLogs: new Map([['run-reviewer', { logLength: 30, lastLine: 'Reading the diff', currentTool: 'Read', progress }]]) };
    expect(projectSnapshot(running, context).runs.find((run) => run.id === 'run-reviewer')).toMatchObject({
      status: 'running',
      usage: progress.usage,
      turns: 6,
      costUsd: 0,
      currentTool: 'Read',
    });
  });

  it('carries the state of every work item the event log describes', () => {
    expect(snapshot.sequence).toBe(fixtureEvents().length);
    expect(snapshot.factory.schedulerPaused).toBe(true);
    expect(snapshot.resources).toMatchObject({ schedulingPaused: true, freeMemoryPercent: 21, pressure: 'warn' });
    expect(snapshot.requests[0]).toMatchObject({
      id: 'req-1',
      state: 'accepted',
      issueNumbers: [42],
      attachments: [{ name: 'header.png', url: '/api/requests/req-1/images/header.png', mediaType: 'image/png' }],
      challenge: { specs: [expect.objectContaining({ id: 'spec-1', issueNumber: 42, validated: true })] },
    });
    expect(snapshot.issues[0]?.requestId).toBe('req-1');
    expect(snapshot.issues.map((issue) => [issue.number, issue.state, issue.paused])).toEqual([
      [42, 'pr-open', false],
      [43, 'spec-validated', true],
      [44, 'needs-human', false],
    ]);
    expect(snapshot.runs.find((run) => run.id === 'run-asking')).toMatchObject({
      status: 'waiting',
      outcome: 'decision-requested',
      pendingQuestion: { id: 'decision-run-asking', text: 'Should the page list the owners by name or by team?', options: [] },
    });
    expect(snapshot.issues[0]?.attempts).toEqual([
      expect.objectContaining({ index: 0, kind: 'session', runId: 'run-implementer', outcome: 'passed' }),
    ]);
    expect(snapshot.runs.map((run) => [run.id, run.role, run.status])).toEqual([
      ['run-asking', 'implementer', 'waiting'],
      ['run-reviewer', 'reviewer', 'succeeded'],
      ['run-implementer', 'implementer', 'succeeded'],
      ['run-author', 'acceptance-author', 'succeeded'],
    ]);
    expect(snapshot.pullRequests[0]).toMatchObject({
      number: 100,
      title: 'feat(app): link mockups to their conversation',
      evidenceComplete: true,
      mergeable: true,
      evidence: [expect.objectContaining({ kind: 'image-compare' }), expect.objectContaining({ kind: 'red-green' }), expect.objectContaining({ kind: 'acceptance-tests' })],
    });
    expect(snapshot.audits[0]).toMatchObject({ state: 'challenge', releaseId: 'app-v1.3.0', draft: { title: 'Audit: patch the build' } });
    expect(snapshot.releases[0]).toMatchObject({ id: 'app-v1.3.0', state: 'blocked', gate: { promotable: false } });
    expect(snapshot.releases[0]?.commits.map((commit) => [commit.attribution, commit.issueNumber, commit.auditId !== null])).toEqual([
      ['audit', null, true],
      ['factory-merge', 42, false],
    ]);
    expect(snapshot.costs.byRole.map((entry) => [entry.role, entry.costUsd])).toEqual([
      ['acceptance-author', 0.4],
      ['implementer', expect.closeTo(1.8)],
      ['reviewer', 0.3],
    ]);
    expect(snapshot.costs.byIssue).toEqual([
      { issueNumber: 42, costUsd: expect.closeTo(2.3), tokens: 21900, runs: 3 },
      { issueNumber: 44, costUsd: expect.closeTo(0.2), tokens: 7300, runs: 1 },
    ]);
  });

  it('charts every day of the cost window, the days without runs at zero', () => {
    const { daily } = snapshot.costs;
    expect(daily).toHaveLength(30);
    expect(daily.at(-1)?.date).toBe(fixtureContext().generatedAt.toISOString().slice(0, 10));
    expect(daily.reduce((sum, day) => sum + day.runs, 0)).toBe(snapshot.runs.filter((run) => run.endedAt !== null).length);
    expect(daily.filter((day) => day.runs === 0).every((day) => day.costUsd === 0)).toBe(true);
  });

  it('keeps the acceptance block of a long gate log before cutting it to the tail the snapshot carries', () => {
    const escape = String.fromCharCode(27);
    const acceptance = ['$ uv run pytest tests/test_x.py --junitxml=/w/r.xml', '2 passed', '[exit code 0 after 900 ms]'].join('\n');
    const suites = ['$ npm run test', `${escape}[32m✓${escape}[39m ${'x'.repeat(5_000)}`, '[exit code 0 after 30000 ms]'].join('\n');
    const log = ['$ mise run lint', 'ok', '[exit code 0 after 10 ms]', acceptance, suites].join('\n');
    expect(proofLogExcerpt(log, 'uv run pytest tests/test_x.py', 1_000)).toBe(acceptance);
    expect(proofLogExcerpt(log, 'uv run pytest tests/other.py', 1_000)).toBe(`✓ ${'x'.repeat(5_000)}\n[exit code 0 after 30000 ms]`.slice(-1_000));
    expect(proofLogExcerpt(log, null, 20)).toBe('exit code 0 after 30000 ms]'.slice(-20));
  });

  it('titles a pull request as the tracker records it', () => {
    const titled = projectSnapshot(fixtureEvents(), { ...fixtureContext(), pullRequestTitles: new Map([[100, 'feat(app): link mockups to their conversation page']]) });
    expect(titled.pullRequests[0]?.title).toBe('feat(app): link mockups to their conversation page');
  });

  it('gives each acceptance check the base result of its own tests', () => {
    expect(snapshot.issues[0]?.checks[0]?.before).toMatchObject({ result: 'failed', detail: '' });
    const kept = fixtureEvents().map((record) => {
      if (record.type !== 'pipeline.before-proof-recorded' || typeof record.payload !== 'object' || record.payload === null || !('tests' in record.payload)) return record;
      const tests = Array.isArray(record.payload.tests) ? record.payload.tests.map((test: object) => ({ ...test, outcome: 'passed', failureKind: null, failureMessage: null })) : [];
      return { ...record, payload: { ...record.payload, tests } };
    });
    expect(projectSnapshot(kept, fixtureContext()).issues[0]?.checks[0]?.before.result).toBe('passed');
  });

  it('shows a release pull request as open until the operator cuts it, then as cut with its gate', () => {
    const events = fixtureEvents();
    const at = (offset: number) => new Date(fixtureContext().generatedAt.getTime() + offset);
    const detected = {
      sequence: events.length + 1,
      occurredAt: at(1),
      type: 'release.detected',
      subject: 'release/pr-31',
      payload: { releaseId: 'pr-31', source: 'pull-request', ref: 'main', baseSha: 'a12', headSha: 'h1', pullRequestNumber: 31, title: 'chore(main): release app 1.3.0' },
    };
    const evaluated = {
      sequence: events.length + 2,
      occurredAt: at(2),
      type: 'release.evaluated',
      subject: 'release/pr-31',
      payload: { releaseId: 'pr-31', promotable: true, blockingReasons: [], commitShas: [], report: 'Promotable.' },
    };
    const cut = {
      sequence: events.length + 3,
      occurredAt: at(3),
      type: 'release.cut',
      subject: 'release/pr-31',
      payload: { releaseId: 'pr-31', pullRequestNumber: 31, headSha: 'h1', mergeSha: 'm31', operator: 'alex' },
    };
    const before = projectSnapshot([...events, detected, evaluated], fixtureContext()).releases.find((release) => release.id === 'pr-31');
    expect(before).toMatchObject({ state: 'open', cutAt: null });
    const after = projectSnapshot([...events, detected, evaluated, cut], fixtureContext()).releases.find((release) => release.id === 'pr-31');
    expect(after).toMatchObject({ state: 'promotable', cutAt: at(3).toISOString() });
  });

  it('keeps the base sha of the proof once the merge released the worktree', () => {
    const events = fixtureEvents();
    const acquired = events.find((record) => record.type === 'pipeline.worktree-acquired' && record.subject === 'issue/42');
    const released = { sequence: events.length + 1, occurredAt: fixtureContext().generatedAt, type: 'pipeline.worktree-released', subject: 'issue/42', payload: { path: '/pool/slot-0' } };
    const redGreen = projectSnapshot([...events, released], fixtureContext()).pullRequests[0]?.evidence.find((entry) => entry.kind === 'red-green');
    expect(redGreen?.kind === 'red-green' ? redGreen.before.sha : null).toBe(WorktreeAcquiredSchema.parse(acquired?.payload).baseSha);
  });

  describe('pull request proof', () => {
    const pullRequest = snapshot.pullRequests[0];

    it('shows only the acceptance step of the gate log, without terminal escape codes', () => {
      const redGreen = pullRequest?.evidence.find((entry) => entry.kind === 'red-green');
      expect(redGreen?.after.log).toBe(
        ['$ pnpm exec playwright test app/e2e/link.spec.ts --reporter=json', '2 passed', '[exit code 0 after 90 ms]'].join('\n'),
      );
    });

    it('falls back to the whole gate log when the acceptance command left no section', () => {
      const context = { ...fixtureContext(), logs: new Map([['42/before-proof.log', 'red'], ['42/gate-attempt-1.log', 'only free text']]) };
      const redGreen = projectSnapshot(fixtureEvents(), context).pullRequests[0]?.evidence.find((entry) => entry.kind === 'red-green');
      expect(redGreen?.after.log).toBe('only free text');
    });

    it('lists each criterion with its test and its outcome on the base and the branch', () => {
      expect(pullRequest?.evidence.find((entry) => entry.kind === 'acceptance-tests')).toEqual({
        kind: 'acceptance-tests',
        id: 'acceptance-tests',
        title: 'Acceptance tests',
        runner: 'playwright',
        criteria: [{ criterion: 1, text: 'The mockup header links the conversation.' }],
        rows: [{ criterion: 1, test: 'app/e2e/link.spec.ts::header links the conversation', name: 'header links the conversation', base: 'red-assertion', branch: 'green' }],
      });
    });

    it('reports the files recorded with the evidence commit', () => {
      expect(pullRequest?.files).toEqual([
        { path: 'app/pages/mockup.vue', additions: 4, deletions: 1, patch: '' },
        { path: 'app/e2e/link.spec.ts', additions: 12, deletions: 0, patch: '' },
      ]);
    });
  });
});
