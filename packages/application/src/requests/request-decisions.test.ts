import { describe, expect, it } from 'vitest';
import { FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import { DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { InMemoryWorkspace } from '../pipeline/testing/pipeline-fakes.ts';
import { renderSpecFile } from './proposed-spec-file.ts';
import {
  acceptProposedSpecs,
  createIssueFromPlan,
  declineRequest,
  planIssueCreation,
  SpecFileRefusedError,
  specOriginOf,
  updateProposedSpec,
} from './request-decisions.ts';
import { REQUEST_CHALLENGED_EVENT, REQUEST_CHALLENGE_STARTED_EVENT, REQUEST_RECEIVED_EVENT, requestSubject } from './request-events.ts';
import { loadRequest } from './request-projection.ts';

const REQUESTS = '/factory/requests';
const CONVENTIONS = DEFAULT_PROJECT_CONVENTIONS;
const SETTINGS = { requestsDirectory: REQUESTS, conventions: CONVENTIONS };
const SPEC_PATH = 'specs/1-link-the-conversation.md';
const DRAFT = {
  title: 'Link the conversation',
  type: 'ui' as const,
  need: 'Operators lose track of the conversation.',
  acceptanceCriteria: ['The header links the conversation.'],
  outOfScope: ['Editing the conversation.'],
  expectedProof: 'A Playwright journey.',
};

async function challenged(events: InMemoryEventStore, workspace: InMemoryWorkspace): Promise<void> {
  const subject = requestSubject('req-1');
  await events.append(REQUEST_RECEIVED_EVENT, subject, {
    id: 'req-1',
    title: 'Link',
    requester: 'Dana',
    channel: 'cli',
    body: 'Link the conversation.',
    attachments: [],
    receivedAt: '2026-10-10T08:00:00.000Z',
  });
  await events.append(REQUEST_CHALLENGE_STARTED_EVENT, subject, { runId: 'r1' });
  await events.append(REQUEST_CHALLENGED_EVENT, subject, {
    runId: 'r1',
    completedAt: '2026-10-10T08:05:00.000Z',
    summary: 'sound',
    items: [],
    specs: [{ id: 'spec-1', itemIds: [], ...DRAFT, path: SPEC_PATH, problems: [] }],
    reply: 'ok',
    reportPath: 'report.md',
    replyPath: 'reply.md',
  });
  workspace.write(`${REQUESTS}/req-1`, SPEC_PATH, renderSpecFile(DRAFT, CONVENTIONS).content);
}

describe('request decisions', () => {
  it('reports a proposed spec of a type the project does not know instead of labelling it', () => {
    const rendered = renderSpecFile({ ...DRAFT, type: 'widget' }, CONVENTIONS);
    expect(rendered.content.split('\n').slice(0, 2)).toEqual(['Title: Link the conversation', 'Labels:']);
    expect(rendered.problems).toEqual([expect.stringContaining('issue type "widget" is not one of this project\'s types')]);
  });

  it('creates the issues of accepted specs once, typed but never validated, and accepts the request', async () => {
    const events = new InMemoryEventStore();
    const workspace = new InMemoryWorkspace();
    const github = new FakeGitHubGateway();
    await challenged(events, workspace);
    const created = await acceptProposedSpecs({ events, github, files: workspace }, SETTINGS, 'req-1', ['spec-1']);
    expect(created.map((issue) => issue.labels)).toEqual([['type:ui']]);
    expect(await acceptProposedSpecs({ events, github, files: workspace }, SETTINGS, 'req-1', ['spec-1'])).toEqual([]);
    expect(await loadRequest(events, 'req-1')).toMatchObject({ state: 'accepted', issueNumbers: [created[0]?.number] });
  });

  it('rewrites a proposed spec file and records the update', async () => {
    const events = new InMemoryEventStore();
    const workspace = new InMemoryWorkspace();
    await challenged(events, workspace);
    await updateProposedSpec({ events, files: workspace }, SETTINGS, 'req-1', 'spec-1', { ...DRAFT, title: 'Link the source conversation' });
    expect(workspace.read(`${REQUESTS}/req-1`, SPEC_PATH)?.split('\n')[0]).toBe('Title: Link the source conversation');
    expect((await loadRequest(events, 'req-1'))?.challenge?.specs[0]?.title).toBe('Link the source conversation');
  });

  it('declines a challenged request', async () => {
    const events = new InMemoryEventStore();
    await challenged(events, new InMemoryWorkspace());
    await declineRequest(events, 'req-1', 'out of product scope');
    expect(await loadRequest(events, 'req-1')).toMatchObject({ state: 'declined', declineReason: 'out of product scope' });
  });

  it('finds the request a spec file belongs to and refuses a pre-validated or malformed file', async () => {
    const events = new InMemoryEventStore();
    await challenged(events, new InMemoryWorkspace());
    expect(await specOriginOf(events, REQUESTS, `${REQUESTS}/req-1/${SPEC_PATH}`)).toEqual({ requestId: 'req-1', specId: 'spec-1' });
    expect(await specOriginOf(events, REQUESTS, '/elsewhere/spec.md')).toBeNull();
    const text = renderSpecFile(DRAFT, CONVENTIONS).content;
    expect(() => planIssueCreation(text.replace('Labels: type:ui', 'Labels: type:ui, spec:validated'), null, CONVENTIONS)).toThrow(SpecFileRefusedError);
    expect(() => planIssueCreation(text.replace('Labels: type:ui', 'Labels: bug'), null, CONVENTIONS)).toThrow('none of the type labels of this project');
    const github = new FakeGitHubGateway();
    const issue = await createIssueFromPlan({ events, github }, planIssueCreation(text, null, CONVENTIONS));
    expect(github.createdIssues).toEqual([{ title: 'Link the conversation', body: issue.body, labels: ['type:ui'] }]);
  });
});
