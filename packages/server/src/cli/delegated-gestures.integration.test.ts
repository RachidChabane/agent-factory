import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SpawnCommandRunner, type NotifyFetchFunction } from '@agent-factory/adapters';
import { delegatedDecisionsOf, loadJournal, ProjectEventStore, type PipelineJournal } from '@agent-factory/application';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { issuePipeline } from '../composition/project/project-use-cases.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, SECOND_PROJECT, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { runCli } from './factory-cli.ts';
import { capturedOutput, cliContext, type CapturedOutput } from './testing/cli-harness.ts';

const TIMEOUT_MS = 120_000;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const REASON = 'a documentation change whose every criterion is proven';
const OPERATOR = 'alex';
const NEW_SPEC = ['Title: Document the on-call rota', 'Labels: type:docs', '', '## Need', 'Readers need the on-call rota.', '', '## Acceptance criteria', '1. The page exists.', '', '## Out of scope', '- Translations.', '', '## Expected proof', 'The rendered page.', ''].join('\n');

/** widgets delegates a lot to its orchestrator; gadgets delegates only the merge of fixes. */
const POLICIES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  [FIRST_PROJECT]: { autonomy: { validateSpecs: true, resume: true, merge: [{ types: ['docs'], requires: [] }] } },
  [SECOND_PROJECT]: { autonomy: { merge: [{ types: ['fix'], requires: [] }] } },
};

describe('gestures made as the delegate of a project', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let specFile = '';
  const notices: string[] = [];
  const warnings: string[] = [];
  const issues = { delegated: 0, refused: 0, operator: 0, guarded: 0 };

  const fetchOfNotices: NotifyFetchFunction = (_url, init) => {
    const message: unknown = JSON.parse(init.body);
    notices.push(typeof message === 'object' && message !== null && 'text' in message && typeof message.text === 'string' ? message.text : '');
    return Promise.resolve({ status: 200 });
  };

  function cli(captured: CapturedOutput) {
    const environment = { ...rehearsal.environment, USER: OPERATOR };
    return cliContext(rehearsal.root, captured, () => Promise.resolve(rehearsal.config), {
      environment,
      runner: new SpawnCommandRunner(),
      workingDirectory: rehearsal.root,
      openInstallation: (loaded, overrides = {}) =>
        openInstallation(loaded, environment, {
          userHome: rehearsal.root,
          resources: NORMAL_RESOURCES,
          usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
          fetch: fetchOfNotices,
          log: { info: () => undefined, warn: (line) => warnings.push(line) },
          ...overrides,
        }),
    });
  }

  async function run(...argv: string[]): Promise<{ code: number; captured: CapturedOutput }> {
    const captured = capturedOutput();
    return { code: await runCli(argv, cli(captured)), captured };
  }

  const eventsOf = (project: string) => new ProjectEventStore(installation.events, project);
  const journalOf = (project: string, issue: number): Promise<PipelineJournal> => loadJournal(eventsOf(project), issue);

  async function openPullRequest(project: string, title: string): Promise<number> {
    const issue = await rehearsal.project(project).addDocIssue(title);
    const outcome = await issuePipeline(installation.project(project), new AbortController().signal).runIssue(issue);
    if (outcome.kind !== 'pr-open') throw new Error(`expected an open pull request, got ${outcome.kind}`);
    return issue;
  }

  beforeAll(async () => {
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT, SECOND_PROJECT], projectSettings: POLICIES });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: fetchOfNotices,
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
      userHome: rehearsal.root,
    });
    issues.delegated = await openPullRequest(FIRST_PROJECT, 'Document the release process');
    issues.guarded = await openPullRequest(FIRST_PROJECT, 'Document the support rota');
    issues.refused = await openPullRequest(SECOND_PROJECT, 'Document the escalation path');
    issues.operator = issues.refused;
    specFile = join(rehearsal.root, 'rota.md');
    await writeFile(specFile, NEW_SPEC);
  }, TIMEOUT_MS * 2);

  afterAll(async () => {
    installation.close();
    await rehearsal.cleanup();
  });

  async function headOf(project: string, issue: number): Promise<{ number: number; head: string }> {
    const journal = await journalOf(project, issue);
    return { number: journal.pullRequest?.number ?? 0, head: journal.pushedHead ?? '' };
  }

  it('merges as the delegate when the policy lists the issue type, records the gesture with its reason and tells the operator', async () => {
    const { number, head } = await headOf(FIRST_PROJECT, issues.delegated);

    const { code, captured } = await run('--project', FIRST_PROJECT, 'merge', String(number), '--expected-head', head, '--as', 'orchestrator', '--reason', REASON);

    expect(captured.errors).toEqual([]);
    expect(code).toBe(0);
    expect(captured.lines[0]).toMatch(new RegExp(`^Pull request #${number} of ${FIRST_PROJECT}#${issues.delegated} merged as [0-9a-f]{40}$`));
    expect(captured.lines[1]).toBe(`Recorded: orchestrator merged pull request #${number}, allowed by autonomy.merge for docs; reason: ${REASON}`);
    const journal = await journalOf(FIRST_PROJECT, issues.delegated);
    expect(journal.mergeSha).not.toBeNull();
    const records = await eventsOf(FIRST_PROJECT).read(`issue/${issues.delegated}`, 0);
    expect(records.findLast((record) => record.type === 'pipeline.pull-request-merged')?.payload).toMatchObject({ actor: 'orchestrator', reason: REASON });
    expect(delegatedDecisionsOf(records)).toMatchObject([
      { actor: 'orchestrator', gesture: 'merge', target: { kind: 'pull-request', number }, issueNumber: issues.delegated, reason: REASON, rule: 'autonomy.merge for docs' },
    ]);
    expect(notices).toContain(`orchestrator merged pull request #${number}`);
  });

  it('refuses to merge as the delegate when the policy lists no rule for the issue type, and leaves everything as it was', async () => {
    const { number, head } = await headOf(SECOND_PROJECT, issues.refused);
    const noticesBefore = notices.length;

    const { code, captured } = await run('--project', SECOND_PROJECT, 'merge', String(number), '--expected-head', head, '--as', 'orchestrator', '--reason', REASON);

    expect(code).toBe(1);
    expect(captured.errors).toEqual([
      `Refused: orchestrator may not merge a pull request in project ${SECOND_PROJECT}: no autonomy.merge rule lists the issue type "docs" (it lists fix)`,
    ]);
    expect(captured.lines).toEqual([]);
    expect((await journalOf(SECOND_PROJECT, issues.refused)).mergeSha).toBeNull();
    expect(delegatedDecisionsOf(await eventsOf(SECOND_PROJECT).read('issue/', 0))).toEqual([]);
    expect(notices.slice(noticesBefore)).toEqual([]);
  });

  it('refuses an actor the project does not name, however much its policy delegates', async () => {
    const { number, head } = await headOf(FIRST_PROJECT, issues.guarded);
    const { code, captured } = await run('--project', FIRST_PROJECT, 'merge', String(number), '--expected-head', head, '--as', 'intern', '--reason', REASON);
    expect(code).toBe(1);
    expect(captured.errors[0]).toContain('the delegate of the project is "orchestrator", not "intern"');
    expect((await journalOf(FIRST_PROJECT, issues.guarded)).mergeSha).toBeNull();
  });

  it('keeps the guards of a merge for the delegate: a head that moved is refused and nothing is recorded', async () => {
    const { number } = await headOf(FIRST_PROJECT, issues.guarded);
    const { code, captured } = await run('--project', FIRST_PROJECT, 'merge', String(number), '--expected-head', 'f'.repeat(40), '--as', 'orchestrator', '--reason', REASON);
    expect(code).toBe(1);
    expect(captured.errors[0]).toContain(`Merge of pull request #${number} refused`);
    expect(delegatedDecisionsOf(await eventsOf(FIRST_PROJECT).read(`issue/${issues.guarded}`, 0))).toEqual([]);
  });

  it('leaves the operator\'s own merge as it was: no --as, no record, no delegate', async () => {
    const { number, head } = await headOf(SECOND_PROJECT, issues.operator);
    const { code, captured } = await run('--project', SECOND_PROJECT, 'merge', String(number), '--expected-head', head);
    expect(captured.errors).toEqual([]);
    expect(code).toBe(0);
    expect(captured.lines).toHaveLength(1);
    const records = await eventsOf(SECOND_PROJECT).read(`issue/${issues.operator}`, 0);
    expect(records.findLast((record) => record.type === 'pipeline.pull-request-merged')?.payload).not.toHaveProperty('actor');
    expect(delegatedDecisionsOf(records)).toEqual([]);
  });

  it('refuses to create and validate an issue as the delegate before it creates anything, when the policy does not delegate validating', async () => {
    const before = (await installation.project(SECOND_PROJECT).forge.listIssues('type:docs')).length;
    const { code, captured } = await run('--project', SECOND_PROJECT, 'issue', 'create', specFile, '--start', '--as', 'orchestrator', '--reason', REASON);
    expect(code).toBe(1);
    expect(captured.errors).toEqual([`Refused: orchestrator may not validate a spec in project ${SECOND_PROJECT}: autonomy.validateSpecs is not set`]);
    expect((await installation.project(SECOND_PROJECT).forge.listIssues('type:docs')).length).toBe(before);
  });

  it('creates and validates an issue as the delegate when the policy delegates validating, and records it', async () => {
    const { code, captured } = await run('--project', FIRST_PROJECT, 'issue', 'create', specFile, '--start', '--as', 'orchestrator', '--reason', REASON);
    expect(captured.errors).toEqual([]);
    expect(code).toBe(0);
    expect(captured.lines[0]).toContain('created on');
    const created = Number(/widgets#(\d+)/.exec(captured.lines[0] ?? '')?.[1]);
    expect(captured.lines.at(-1)).toBe(`Recorded: orchestrator validated the spec of issue #${created}, allowed by autonomy.validateSpecs; reason: ${REASON}`);
    const records = await eventsOf(FIRST_PROJECT).read(`issue/${created}`, 0);
    expect(records.find((record) => record.type === 'issue.spec-validated')?.payload).toEqual({ operator: OPERATOR, actor: 'orchestrator', reason: REASON });
    expect(delegatedDecisionsOf(records)).toHaveLength(1);
  });

  it('validates the spec of a drafted issue as the operator, or as the delegate when the policy allows it', async () => {
    const draft = await rehearsal.project(SECOND_PROJECT).addDraftDocIssue('Document the pager rota');
    const refused = await run('--project', SECOND_PROJECT, 'issue', 'validate', String(draft), '--as', 'orchestrator', '--reason', REASON);
    expect(refused.code).toBe(1);
    expect(refused.captured.errors[0]).toContain('autonomy.validateSpecs is not set');
    const operator = await run('--project', SECOND_PROJECT, 'issue', 'validate', String(draft));
    expect(operator.captured.errors).toEqual([]);
    expect(operator.code).toBe(0);
    expect(operator.captured.lines).toEqual([`The spec of ${SECOND_PROJECT}#${draft} is validated and labelled spec:validated: the factory takes it at its next tick`]);
    expect(delegatedDecisionsOf(await eventsOf(SECOND_PROJECT).read(`issue/${draft}`, 0))).toEqual([]);
  });

  it('refuses a resume the policy does not delegate before looking at the issue, and lets one it delegates reach the use case', async () => {
    const refused = await run('--project', SECOND_PROJECT, 'resume', '99', '--as', 'orchestrator', '--reason', REASON);
    expect(refused.code).toBe(1);
    expect(refused.captured.errors).toEqual([`Refused: orchestrator may not resume an issue in project ${SECOND_PROJECT}: autonomy.resume is not set`]);
    const answering = await run('--project', FIRST_PROJECT, 'resume', '99', '--answer', 'Use the team name.', '--as', 'orchestrator', '--reason', REASON);
    expect(answering.captured.errors).toEqual([`Refused: orchestrator may not answer a decision in project ${FIRST_PROJECT}: autonomy.answerDecisions is not set`]);
    const allowed = await run('--project', FIRST_PROJECT, 'resume', '99', '--as', 'orchestrator', '--reason', REASON);
    expect(allowed.code).toBe(1);
    expect(allowed.captured.errors[0]).toMatch(/^Issue #99 cannot be resumed/);
  });
});
