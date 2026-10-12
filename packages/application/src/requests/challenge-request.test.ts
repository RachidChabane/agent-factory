import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { InMemoryEventStore, ScriptedHarness, StubPromptCatalog, runResult } from '../audit/testing/fakes.ts';
import { InMemoryWorkspace, SequentialIds } from '../pipeline/testing/pipeline-fakes.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { parseSpecFile, specFileProblems } from '../spec/index.ts';
import { AddRequest } from './add-request.ts';
import { ChallengeRequest, type ChallengeProfile } from './challenge-request.ts';
import { RequestChallengeRefusedError, RequestNotFoundError } from './errors.ts';
import { REQUEST_DECLINED_EVENT, REQUEST_ISSUE_CREATED_EVENT, requestSubject } from './request-events.ts';
import { loadRequest } from './request-projection.ts';
import { FakeBaseCheckouts, StaticKnowledge, answerItem, answerSpec, challengeAnswer } from './testing/request-fakes.ts';

const REQUESTS_DIRECTORY = '/requests';
const UPLOADS = '/uploads';
const REQUEST_DIRECTORY = '/requests/req-1';
const REPOSITORY = 'acme/widgets';
const KNOWLEDGE = 'Product knowledge.';
const PROFILE: ChallengeProfile = { model: 'opus', effort: 'high', maxBudgetUsd: 4, maxTurns: 60, timeoutMs: 120_000 };

async function setup(script: ConstructorParameters<typeof ScriptedHarness>[0], image = true) {
  const events = new InMemoryEventStore();
  const workspace = new InMemoryWorkspace();
  const clock = new SteppingClock(new Date('2026-03-04T05:06:07.000Z'));
  const harness = new ScriptedHarness(script);
  const checkouts = new FakeBaseCheckouts();
  workspace.write(UPLOADS, 'screen.png', 'png-bytes');
  await new AddRequest({ events, files: workspace, clock }, { requestsDirectory: REQUESTS_DIRECTORY }).add({
    title: 'Cost on the run page',
    requester: 'alice',
    channel: 'chat',
    body: 'Show the cost on the run page.',
    images: image ? [{ name: 'screen.png', sourceDirectory: UPLOADS }] : [],
  });
  const challenge = new ChallengeRequest(
    {
      events,
      harness,
      roles: new StubPromptCatalog(),
      files: workspace,
      checkouts,
      knowledge: new StaticKnowledge(KNOWLEDGE),
      clock,
      ids: new SequentialIds(),
    },
    { repository: REPOSITORY, requestsDirectory: REQUESTS_DIRECTORY, profile: PROFILE, conventions: DEFAULT_PROJECT_CONVENTIONS },
  );
  return { events, workspace, harness, checkouts, challenge };
}

function succeeded(finalText: string) {
  return runResult({ outcome: 'success', finalText });
}

describe('ChallengeRequest', () => {
  it('runs the challenger on a base checkout with the request, its images and the knowledge', async () => {
    const { harness, checkouts, challenge } = await setup([succeeded(challengeAnswer())]);

    await challenge.challenge('req-1');

    expect(checkouts.created).toEqual(['request-req-1']);
    const [request] = harness.requests;
    expect(request).toMatchObject({
      runId: 'run-1',
      role: 'challenger',
      model: 'opus',
      effort: 'high',
      workingDirectory: '/checkouts/request-req-1',
      context: { subject: { kind: 'request', id: 'req-1' }, attempt: 0, branch: null },
      account: null,
      frozenChecks: [],
      gateCommand: null,
      appendSystemPrompt: '',
      allowedTools: [],
      mcpServers: {},
      maxBudgetUsd: 4,
      maxTurns: 60,
      timeoutMs: 120_000,
    });
    expect(request?.prompt).toContain(`repository=${REPOSITORY}`);
    expect(request?.prompt).toContain('request=Show the cost on the run page.');
    expect(request?.prompt).toContain(`images=${REQUEST_DIRECTORY}/images/screen.png`);
    expect(request?.prompt).toContain(`knowledge=${KNOWLEDGE}`);
  });

  it('tells the agent there is no image when the request has none', async () => {
    const { harness, challenge } = await setup([succeeded(challengeAnswer())], false);
    await challenge.challenge('req-1');
    expect(harness.requests[0]?.prompt).toContain('images=none');
  });

  it('removes the checkout after a successful run', async () => {
    const { checkouts, challenge } = await setup([succeeded(challengeAnswer())]);
    await challenge.challenge('req-1');
    expect(checkouts.removed).toEqual([{ path: '/checkouts/request-req-1', sha: 'base0000' }]);
  });

  it('removes the checkout even when the run crashes', async () => {
    const { checkouts, events, challenge } = await setup([new Error('boom')]);
    const outcome = await challenge.challenge('req-1');
    expect(outcome).toMatchObject({ status: 'failed', reason: 'the run failed: boom' });
    expect(checkouts.removed).toHaveLength(1);
    expect(events.typesOf('request/req-1')).toEqual(['request.received', 'request.challenge-started', 'request.challenge-failed']);
  });

  it('writes the specs, the report and the reply, then appends request.challenged', async () => {
    const { events, workspace, challenge } = await setup([succeeded(challengeAnswer())]);

    const outcome = await challenge.challenge('req-1');

    expect(outcome).toMatchObject({
      status: 'challenged',
      requestId: 'req-1',
      runId: 'run-1',
      specPaths: ['specs/1-show-the-cost-on-the-run-page.md'],
      problems: [],
      items: [{ id: 'item-1', verdict: 'keep', sources: [{ label: 'Run page', reference: 'app/runs.tsx:12' }] }],
    });
    expect(workspace.read(REQUEST_DIRECTORY, 'reply.md')).toBe('We will add the cost to the run page.');
    const report = workspace.read(REQUEST_DIRECTORY, 'report.md') ?? '';
    expect(report).toContain('One item, worth doing.');
    expect(report).toContain('## item-1: Show the cost on the run page');
    expect(report).toContain('- Current state: The run page shows no cost (app/runs.tsx:12).');
    expect(report).toContain('- Question: none');
    expect(report).toContain('  - Run page: app/runs.tsx:12');
    expect(report).toContain('- specs/1-show-the-cost-on-the-run-page.md: Show the cost on the run page');

    const record = await loadRequest(events, 'req-1');
    expect(record).toMatchObject({
      state: 'challenged',
      challenge: {
        runId: 'run-1',
        completedAt: '2026-03-04T05:06:07.000Z',
        summary: 'One item, worth doing.',
        reportPath: 'report.md',
        replyPath: 'reply.md',
        specs: [{ id: 'spec-1', itemIds: ['item-1'], type: 'ui', path: 'specs/1-show-the-cost-on-the-run-page.md', problems: [] }],
      },
    });
  });

  it('writes spec files that parse back with no problem', async () => {
    const { workspace, challenge } = await setup([succeeded(challengeAnswer())]);
    await challenge.challenge('req-1');

    const text = workspace.read(REQUEST_DIRECTORY, 'specs/1-show-the-cost-on-the-run-page.md') ?? '';
    expect(text.startsWith('Title: Show the cost on the run page\nLabels: type:ui\n\n## Need')).toBe(true);
    const file = parseSpecFile(text);
    expect(file).toMatchObject({ title: 'Show the cost on the run page', labels: ['type:ui'] });
    expect(specFileProblems(file, DEFAULT_PROJECT_CONVENTIONS)).toEqual([]);
  });

  it('still writes a spec whose body cannot render losslessly and records the problem', async () => {
    const lossy = answerSpec({ title: 'Lossy spec', acceptanceCriteria: ['First line\n\nSecond paragraph'] });
    const { workspace, events, challenge } = await setup([succeeded(challengeAnswer({ specs: [answerSpec(), lossy] }))]);

    const outcome = await challenge.challenge('req-1');

    expect(workspace.read(REQUEST_DIRECTORY, 'specs/2-lossy-spec.md')).toContain('Second paragraph');
    expect(outcome.status === 'challenged' && outcome.problems.map((entry) => entry.specId)).toEqual(['spec-2']);
    const specs = (await loadRequest(events, 'req-1'))?.challenge?.specs ?? [];
    expect(specs[0]?.problems).toEqual([]);
    expect(specs[1]?.problems[0]).toContain('cannot be rendered losslessly');
    expect(workspace.read(REQUEST_DIRECTORY, 'report.md')).toContain('specs/2-lossy-spec.md: Lossy spec (problems:');
  });

  it('keeps a spec of a type the project does not know and records the problem', async () => {
    const unknown = answerSpec({ title: 'Widget spec', type: 'widget' });
    const { workspace, events, challenge } = await setup([succeeded(challengeAnswer({ specs: [answerSpec(), unknown] }))]);

    const outcome = await challenge.challenge('req-1');

    expect(workspace.read(REQUEST_DIRECTORY, 'specs/2-widget-spec.md')?.split('\n')[1]).toBe('Labels:');
    expect(outcome.status === 'challenged' && outcome.problems.map((entry) => entry.specId)).toEqual(['spec-2']);
    const specs = (await loadRequest(events, 'req-1'))?.challenge?.specs ?? [];
    expect(specs[1]).toMatchObject({ type: 'widget', problems: [expect.stringContaining('issue type "widget" is not one of')] });
  });

  it('lists the project issue types in the challenger prompt', async () => {
    const { harness, challenge } = await setup([succeeded(challengeAnswer())]);
    await challenge.challenge('req-1');
    expect(harness.requests[0]?.prompt).toContain(`issueTypes=${DEFAULT_PROJECT_CONVENTIONS.typology.ids().join(', ')}`);
  });

  it('derives the item ids of a spec from its item numbers', async () => {
    const answer = challengeAnswer({
      items: [answerItem(), answerItem({ title: 'Second', verdict: 'ask', question: 'Which run?' })],
      specs: [answerSpec({ items: [1, 2] })],
    });
    const { events, challenge } = await setup([succeeded(answer)]);
    await challenge.challenge('req-1');
    const challenged = (await loadRequest(events, 'req-1'))?.challenge;
    expect(challenged?.specs[0]?.itemIds).toEqual(['item-1', 'item-2']);
    expect(challenged?.items[1]).toMatchObject({ id: 'item-2', verdict: 'ask', question: 'Which run?' });
  });

  it.each([
    ['a non-success outcome', runResult({ outcome: 'max-turns', finalText: challengeAnswer() }), 'the run ended with outcome max-turns'],
    ['an answer without a json block', succeeded('no block'), 'no fenced json block'],
    ['an answer that does not match the schema', succeeded(challengeAnswer({ items: [answerItem({ verdict: 'nope' })] })), 'challenge schema'],
  ])('appends request.challenge-failed for %s and allows a retry', async (_label, failing, fragment) => {
    const { events, workspace, harness, checkouts, challenge } = await setup([failing, succeeded(challengeAnswer())]);

    const outcome = await challenge.challenge('req-1');

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.reason).toContain(fragment);
    expect(checkouts.removed).toHaveLength(1);
    expect(workspace.read(REQUEST_DIRECTORY, 'report.md')).toBeUndefined();
    expect(await loadRequest(events, 'req-1')).toMatchObject({ state: 'challenging', lastFailure: expect.stringContaining(fragment) });

    const retry = await challenge.challenge('req-1');

    expect(retry.status).toBe('challenged');
    expect(harness.requests.map((request) => request.context.attempt)).toEqual([0, 1]);
    expect(await loadRequest(events, 'req-1')).toMatchObject({ state: 'challenged', lastFailure: null });
  });

  it('refuses an unknown request', async () => {
    const { challenge } = await setup([]);
    await expect(challenge.challenge('req-9')).rejects.toBeInstanceOf(RequestNotFoundError);
  });

  it('refuses a declined request without checking anything out', async () => {
    const { events, harness, checkouts, challenge } = await setup([succeeded(challengeAnswer())]);
    await challenge.challenge('req-1');
    await events.append(REQUEST_DECLINED_EVENT, requestSubject('req-1'), { reason: 'out of scope' });

    await expect(challenge.challenge('req-1')).rejects.toBeInstanceOf(RequestChallengeRefusedError);
    expect(harness.requests).toHaveLength(1);
    expect(checkouts.created).toHaveLength(1);
  });

  it('refuses an accepted request', async () => {
    const { events, challenge } = await setup([succeeded(challengeAnswer())]);
    await challenge.challenge('req-1');
    await events.append(REQUEST_ISSUE_CREATED_EVENT, requestSubject('req-1'), { specId: 'spec-1', issueNumber: 7 });
    await expect(challenge.challenge('req-1')).rejects.toBeInstanceOf(RequestChallengeRefusedError);
  });

  it('refuses a request that is already challenged', async () => {
    const { challenge } = await setup([succeeded(challengeAnswer())]);
    await challenge.challenge('req-1');
    await expect(challenge.challenge('req-1')).rejects.toBeInstanceOf(RequestChallengeRefusedError);
  });
});

describe('ChallengeRequest checkout lifecycle', () => {
  it('removes the checkout when preparing the prompt fails', async () => {
    const events = new InMemoryEventStore();
    const workspace = new InMemoryWorkspace();
    const clock = new SteppingClock(new Date(0));
    const checkouts = new FakeBaseCheckouts();
    await new AddRequest({ events, files: workspace, clock }, { requestsDirectory: REQUESTS_DIRECTORY }).add({
      title: 't',
      requester: 'r',
      channel: 'c',
      body: 'b',
      images: [],
    });
    const failingKnowledge = { read: () => Promise.reject(new Error('knowledge unreadable')) };
    const challenge = new ChallengeRequest(
      { events, harness: new ScriptedHarness([]), roles: new StubPromptCatalog(), files: workspace, checkouts, knowledge: failingKnowledge, clock, ids: new SequentialIds() },
      { repository: REPOSITORY, requestsDirectory: REQUESTS_DIRECTORY, profile: PROFILE, conventions: DEFAULT_PROJECT_CONVENTIONS },
    );

    await expect(challenge.challenge('req-1')).rejects.toThrow('knowledge unreadable');
    expect(checkouts.removed).toHaveLength(1);
  });
});
