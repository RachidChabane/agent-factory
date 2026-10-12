import { describe, expect, it } from 'vitest';
import { CostsViewSchema, ProjectViewSchema, RunViewSchema } from '@agent-factory/cockpit';
import { WorktreeAcquiredSchema, type FactoryEventRecord } from '@agent-factory/application';
import { projectCosts } from './cost-views.ts';
import { indexEvents } from './event-index.ts';
import { issueJournals } from './issue-views.ts';
import { projectView, type ProjectReadingsView } from './project-view.ts';
import { proofLogExcerpt } from './pull-request-views.ts';
import { pendingQuestions, projectRuns, recordedRuns } from './run-views.ts';
import { COST_SETTINGS, GENERATED_AT, PROJECT, projectContext, projectHistory, type ProjectHistory } from './testing/project-history.ts';

const READINGS: ProjectReadingsView = { forgeUrl: 'https://github.com/acme/widgets', workflows: null, deployments: () => null, knowledge: [], tools: [] };

function viewOf(history: ProjectHistory = projectHistory(), context = projectContext(history)) {
  return projectView(PROJECT, history.project, context, READINGS);
}

function withProjectEvents(history: ProjectHistory, ...extra: readonly Omit<FactoryEventRecord, 'sequence'>[]): ProjectHistory {
  const last = Math.max(...[...history.project, ...history.installation].map((record) => record.sequence));
  return { ...history, project: [...history.project, ...extra.map((record, index) => ({ ...record, sequence: last + index + 1 }))] };
}

describe('the view of one project', () => {
  const { view } = viewOf();

  it('produces a view the cockpit contract accepts', () => {
    expect(ProjectViewSchema.safeParse(view).error?.issues ?? []).toEqual([]);
  });

  it('carries the state of every work item the project events describe', () => {
    expect(view.pauses.map((pause) => [pause.scope, pause.cause])).toEqual([['project', 'operator']]);
    expect(view.requests[0]).toMatchObject({
      id: 'req-1',
      state: 'accepted',
      issueNumbers: [42],
      attachments: [{ name: 'header.png', url: '/api/projects/widgets/requests/req-1/images/header.png', mediaType: 'image/png' }],
      challenge: { specs: [expect.objectContaining({ id: 'spec-1', issueNumber: 42, problems: [] })] },
    });
    expect(view.issues[0]?.requestId).toBe('req-1');
    expect(view.issues.map((issue) => [issue.number, issue.state, issue.paused])).toEqual([
      [42, 'pr-open', false],
      [43, 'spec-validated', true],
      [44, 'needs-human', false],
    ]);
    expect(view.issues[0]?.attempts).toEqual([expect.objectContaining({ index: 0, kind: 'session', runId: 'run-implementer', outcome: 'passed' })]);
    expect(view.issues[0]?.costUsd).toBeCloseTo(2.3);
    expect(view.pullRequests[0]).toMatchObject({
      number: 100,
      title: 'feat(app): link mockups to their conversation',
      evidenceComplete: true,
      mergeable: true,
      evidence: [expect.objectContaining({ kind: 'image-compare' }), expect.objectContaining({ kind: 'red-green' }), expect.objectContaining({ kind: 'acceptance-tests' })],
    });
    expect(view.audits[0]).toMatchObject({ state: 'challenge', releaseId: 'app-v1.3.0', draft: { title: 'Audit: patch the build' } });
    expect(view.releases[0]).toMatchObject({ id: 'app-v1.3.0', state: 'blocked', gate: { promotable: false } });
    expect(view.releases[0]?.commits.map((commit) => [commit.attribution, commit.issueNumber, commit.auditId !== null])).toEqual([
      ['audit', null, true],
      ['factory-merge', 42, false],
    ]);
  });

  it('shows an issue the factory opened as a draft until the operator validates it, dated by the forge', () => {
    const history = projectHistory();
    const [waiting] = projectContext(history).pendingIssues;
    if (waiting === undefined) throw new Error('the project has an issue waiting to be taken');
    const drafted = viewOf(history, projectContext(history, { pendingIssues: [{ ...waiting, validated: false }] }));
    expect(drafted.view.issues.find((issue) => issue.number === 43)).toMatchObject({ state: 'spec-draft', createdAt: '2026-10-09T09:30:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' });
    expect(view.issues.find((issue) => issue.number === 43)?.state).toBe('spec-validated');
  });

  it('names the forge and the environments the project declares, unknown until read', () => {
    expect(view.forge).toEqual({ kind: 'github', url: 'https://github.com/acme/widgets' });
    expect(view.environments.map((environment) => [environment.name, environment.status, environment.production])).toEqual([
      ['staging', 'unknown', false],
      ['production', 'unknown', true],
    ]);
    expect(view.workflows).toBeNull();
  });

  it('gives each acceptance check the base result of its own tests', () => {
    expect(view.issues[0]?.checks[0]?.before).toMatchObject({ result: 'failed', detail: '' });
    const history = projectHistory();
    const kept = {
      ...history,
      project: history.project.map((record) => {
        if (record.type !== 'pipeline.before-proof-recorded' || typeof record.payload !== 'object' || record.payload === null || !('tests' in record.payload)) return record;
        const tests = Array.isArray(record.payload.tests) ? record.payload.tests.map((test: object) => ({ ...test, outcome: 'passed', failureKind: null, failureMessage: null })) : [];
        return { ...record, payload: { ...record.payload, tests } };
      }),
    };
    expect(viewOf(kept).view.issues[0]?.checks[0]?.before.result).toBe('passed');
  });

  it('titles a pull request as the forge records it', () => {
    const titled = viewOf(projectHistory(), projectContext(projectHistory(), { pullRequestTitles: new Map([[100, 'feat(app): link mockups to their conversation page']]) }));
    expect(titled.view.pullRequests[0]?.title).toBe('feat(app): link mockups to their conversation page');
  });

  it('shows a release pull request as open until the operator cuts it, then as cut with its gate', () => {
    const at = (offset: number) => new Date(GENERATED_AT.getTime() + offset);
    const detected = {
      occurredAt: at(1),
      type: 'release.detected',
      subject: 'release/pr-31',
      payload: { releaseId: 'pr-31', source: 'pull-request', ref: 'main', baseSha: 'a12', headSha: 'h1', pullRequestNumber: 31, title: 'chore(main): release app 1.3.0' },
    };
    const evaluated = {
      occurredAt: at(2),
      type: 'release.evaluated',
      subject: 'release/pr-31',
      payload: { releaseId: 'pr-31', promotable: true, blockingReasons: [], commitShas: [], report: 'Promotable.' },
    };
    const cut = { occurredAt: at(3), type: 'release.cut', subject: 'release/pr-31', payload: { releaseId: 'pr-31', pullRequestNumber: 31, headSha: 'h1', mergeSha: 'm31', operator: 'alex' } };
    const before = viewOf(withProjectEvents(projectHistory(), detected, evaluated)).view.releases.find((release) => release.id === 'pr-31');
    expect(before).toMatchObject({ state: 'open', cutAt: null });
    const after = viewOf(withProjectEvents(projectHistory(), detected, evaluated, cut)).view.releases.find((release) => release.id === 'pr-31');
    expect(after).toMatchObject({ state: 'promotable', cutAt: at(3).toISOString() });
  });

  it('keeps the base sha of the proof once the merge released the worktree', () => {
    const history = projectHistory();
    const acquired = history.project.find((record) => record.type === 'pipeline.worktree-acquired' && record.subject === 'issue/42');
    const released = withProjectEvents(history, { occurredAt: GENERATED_AT, type: 'pipeline.worktree-released', subject: 'issue/42', payload: { path: '/pool/slot-0' } });
    const redGreen = viewOf(released).view.pullRequests[0]?.evidence.find((entry) => entry.kind === 'red-green');
    expect(redGreen?.kind === 'red-green' ? redGreen.before.sha : null).toBe(WorktreeAcquiredSchema.parse(acquired?.payload).baseSha);
  });

  describe('the proof of a pull request', () => {
    const pullRequest = view.pullRequests[0];

    it('shows only the acceptance step of the gate log, without terminal escape codes', () => {
      const redGreen = pullRequest?.evidence.find((entry) => entry.kind === 'red-green');
      expect(redGreen?.after.log).toBe(['$ pnpm exec playwright test app/e2e/link.spec.ts --reporter=json', '2 passed', '[exit code 0 after 90 ms]'].join('\n'));
    });

    it('falls back to the whole gate log when the acceptance command left no section', () => {
      const history = projectHistory();
      const context = projectContext(history, { logs: new Map([['42/before-proof.log', 'red'], ['42/gate-attempt-1.log', 'only free text']]) });
      const redGreen = viewOf(history, context).view.pullRequests[0]?.evidence.find((entry) => entry.kind === 'red-green');
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

    it('keeps the acceptance block of a long gate log before cutting it to the tail the view carries', () => {
      const escape = String.fromCharCode(27);
      const acceptance = ['$ uv run pytest tests/test_x.py --junitxml=/w/r.xml', '2 passed', '[exit code 0 after 900 ms]'].join('\n');
      const suites = ['$ npm run test', `${escape}[32m✓${escape}[39m ${'x'.repeat(5_000)}`, '[exit code 0 after 30000 ms]'].join('\n');
      const log = ['$ mise run lint', 'ok', '[exit code 0 after 10 ms]', acceptance, suites].join('\n');
      expect(proofLogExcerpt(log, 'uv run pytest tests/test_x.py', 1_000)).toBe(acceptance);
      expect(proofLogExcerpt(log, 'uv run pytest tests/other.py', 1_000)).toBe(`✓ ${'x'.repeat(5_000)}\n[exit code 0 after 30000 ms]`.slice(-1_000));
      expect(proofLogExcerpt(log, null, 20)).toBe('exit code 0 after 30000 ms]'.slice(-20));
    });
  });
});

describe('the runs and costs of the installation', () => {
  const history = projectHistory();
  const runs = recordedRuns(indexEvents(history.installation));
  const questions = pendingQuestions(indexEvents(history.project), issueJournals(indexEvents(history.project)));

  it('lists every run, newest first, stamped with its project, with the question a waiting run asks', () => {
    const views = projectRuns(runs, new Map(), questions);
    for (const view of views) expect(RunViewSchema.safeParse(view).error?.issues ?? []).toEqual([]);
    expect(views.map((run) => [run.id, run.role, run.status, run.project])).toEqual([
      ['run-asking', 'implementer', 'waiting', 'widgets'],
      ['run-reviewer', 'reviewer', 'succeeded', 'widgets'],
      ['run-implementer', 'implementer', 'succeeded', 'widgets'],
      ['run-author', 'acceptance-author', 'succeeded', 'widgets'],
    ]);
    expect(views[0]).toMatchObject({ outcome: 'decision-requested', pendingQuestion: { id: 'decision-run-asking', text: 'Should the page list the owners by name or by team?', options: [] } });
  });

  it('shows the tokens and turns a running agent has used so far', () => {
    const running = recordedRuns(indexEvents(history.installation.filter((record) => !(record.type === 'run.finished' && record.subject === 'run/run-reviewer'))));
    const progress = { usage: { inputTokens: 40, outputTokens: 900, cacheReadTokens: 12_000, cacheCreationTokens: 3_000 }, turns: 6 };
    const views = projectRuns(running, new Map([['run-reviewer', { logLength: 30, lastLine: 'Reading the diff', currentTool: 'Read', progress }]]), new Map());
    expect(views.find((run) => run.id === 'run-reviewer')).toMatchObject({ status: 'running', usage: progress.usage, turns: 6, costUsd: 0, currentTool: 'Read' });
  });

  it('sums the cost by role, issue and project, says what the dollars mean, and counts tokens with and without the cache', () => {
    const costs = projectCosts(runs, COST_SETTINGS);
    expect(CostsViewSchema.safeParse(costs).error?.issues ?? []).toEqual([]);
    expect(costs.basis).toBe('subscription-equivalent');
    expect(costs.byRole.map((entry) => [entry.key, entry.costUsd])).toEqual([
      ['implementer', expect.closeTo(1.8)],
      ['acceptance-author', 0.4],
      ['reviewer', 0.3],
    ]);
    expect(costs.byIssue.map((entry) => [entry.project, entry.issueNumber, entry.costUsd, entry.runs])).toEqual([
      ['widgets', 42, expect.closeTo(2.3), 3],
      ['widgets', 44, expect.closeTo(0.2), 1],
    ]);
    expect(costs.byProject.map((entry) => entry.key)).toEqual(['widgets']);
    expect(costs.tokens.withCache).toBe(costs.tokens.withoutCache + costs.tokens.cacheRead + costs.tokens.cacheCreation);
    expect(costs.tokens.withoutCache).toBe(costs.tokens.input + costs.tokens.output);
  });

  it('charts every day of the cost window, the days without runs at zero', () => {
    const { daily } = projectCosts(runs, COST_SETTINGS);
    expect(daily).toHaveLength(30);
    expect(daily.at(-1)?.date).toBe(GENERATED_AT.toISOString().slice(0, 10));
    expect(daily.reduce((sum, day) => sum + day.runs, 0)).toBe(runs.filter((run) => run.finished !== null).length);
    expect(daily.filter((day) => day.runs === 0).every((day) => day.costUsd === 0)).toBe(true);
  });
});
