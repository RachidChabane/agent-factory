import { describe, expect, it } from 'vitest';
import { ISSUE_TRANSITIONED_EVENT, issueSubject } from '@agent-factory/domain';
import { SteppingClock } from '../runs/test-support.ts';
import { IssueTransitionedPayloadSchema, PIPELINE_EVENTS } from './journal-events.ts';
import { MergeOnOrder } from './merge-on-order.ts';
import { CheckRewriteRefusedError, OrderCheckRewrite } from './order-check-rewrite.ts';
import { BASE_WORKSPACES_ROOT } from './testing/pipeline-fakes.ts';
import { CHECK_PATH, IMPLEMENTED, ISSUE_NUMBER, MANIFEST, PipelineScenario, PRODUCT_PATH, SETTINGS, SETUP_COMMAND } from './testing/pipeline-scenario.ts';

const REWRITTEN = "test('the header links the conversation by its accessible name', async () => {});\n";
const INSTRUCTION = 'Assert the link by its accessible name, not by its position in the header.';
const ORDERED_AT = new Date('2026-10-10T09:00:00.000Z');
const REWRITE_WORKSPACE = `${BASE_WORKSPACES_ROOT}/rewrite-issue-${ISSUE_NUMBER}`;
const PULL_REQUEST = 100;

function orders(scenario: PipelineScenario): OrderCheckRewrite {
  return new OrderCheckRewrite({ events: scenario.events, states: scenario.states, clock: new SteppingClock(ORDERED_AT) });
}

function order(scenario: PipelineScenario, path: string = CHECK_PATH, instruction: string = INSTRUCTION) {
  return orders(scenario).order({ issueNumber: ISSUE_NUMBER, path, instruction, operator: 'alex' });
}

function scriptRewrite(scenario: PipelineScenario, content: string = REWRITTEN): void {
  scenario.harness.script('acceptance-author', { effect: (request) => scenario.workspace.write(request.workingDirectory, CHECK_PATH, content) });
}

async function states(scenario: PipelineScenario): Promise<readonly string[]> {
  return (await scenario.events.read(issueSubject(ISSUE_NUMBER), 0))
    .filter((record) => record.type === ISSUE_TRANSITIONED_EVENT)
    .map((record) => IssueTransitionedPayloadSchema.parse(record.payload).to);
}

describe('rewriting a frozen check on operator order', () => {
  it('rewrites the check of an open pull request, proves it red on a clean base, re-freezes it and updates the pull request', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const frozenBefore = (await scenario.journal()).frozen?.checks[0]?.sha256;
    scriptRewrite(scenario);

    expect(await order(scenario)).toEqual({ issueNumber: ISSUE_NUMBER, path: CHECK_PATH, transitioned: true, driven: false });
    expect((await scenario.journal()).state).toBe('rewriting-check');
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({ kind: 'pr-open', pullRequest: { number: PULL_REQUEST } });

    const journal = await scenario.journal();
    const rewrite = journal.checkRewrites[0];
    expect(rewrite).toMatchObject({ path: CHECK_PATH, instruction: INSTRUCTION, operator: 'alex', previousSha256: frozenBefore, nextAttempt: 1 });
    expect(rewrite?.sha256).not.toBe(frozenBefore);
    expect(journal.frozen?.checks).toEqual([{ path: CHECK_PATH, sha256: rewrite?.sha256 }]);
    expect(journal.beforeProof?.evaluation.valid).toBe(true);
    expect(journal.checkRewrite).toBeNull();

    const author = scenario.harness.requestsOf('acceptance-author').at(-1);
    expect(author).toMatchObject({ resumeSessionId: null, frozenChecks: [], workingDirectory: scenario.worktree().path });
    expect(author?.prompt).toContain(INSTRUCTION);
    expect(author?.prompt).toContain(`Rewrite \`${CHECK_PATH}\``);

    expect(scenario.baseWorkspaces.opened).toEqual([REWRITE_WORKSPACE]);
    expect(scenario.baseWorkspaces.removed).toEqual([REWRITE_WORKSPACE]);
    expect(scenario.runner.executed.filter((entry) => entry.command === SETUP_COMMAND).map((entry) => entry.cwd)).toContain(REWRITE_WORKSPACE);
    expect(scenario.workspace.read(REWRITE_WORKSPACE, PRODUCT_PATH)).toBeUndefined();

    const history = scenario.sourceControl.history(scenario.worktree());
    const rewriteCommit = history.find((commit) => commit.sha === rewrite?.commitSha);
    expect(rewriteCommit?.message).toBe(`test(app): rewrite the acceptance check ${CHECK_PATH} for #${ISSUE_NUMBER}`);
    const previous = history[history.findIndex((commit) => commit.sha === rewrite?.commitSha) - 1];
    const changed = [...(rewriteCommit?.snapshot.keys() ?? [])].filter((path) => rewriteCommit?.snapshot.get(path) !== previous?.snapshot.get(path));
    expect(changed).toEqual([CHECK_PATH]);

    const implementer = scenario.harness.requestsOf('implementer');
    expect(implementer).toHaveLength(2);
    expect(implementer[1]?.resumeSessionId).toBeNull();
    expect(implementer[1]?.prompt).toContain('A frozen check was rewritten');
    expect(scenario.github.opened).toHaveLength(1);
    expect(scenario.github.bodyUpdates).toHaveLength(1);
    expect((await states(scenario)).slice(-7)).toEqual(['rewriting-check', 'checks-frozen', 'implementing', 'gating', 'reviewing', 'producing-evidence', 'pr-open']);
    const ordered = (await scenario.events.read(issueSubject(ISSUE_NUMBER), 0)).find((record) => record.type === PIPELINE_EVENTS.checkRewriteOrdered);
    expect(ordered?.payload).toEqual({ path: CHECK_PATH, instruction: INSTRUCTION, operator: 'alex', orderedAt: ORDERED_AT.toISOString(), fromState: 'pr-open' });
  });

  it('gives the implementer a fresh retry budget after the rewrite of a check that sent it to a human', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 4;
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
    await expect(scenario.resumer().resume(ISSUE_NUMBER)).rejects.toThrow('retry budget is spent');
    scriptRewrite(scenario);
    await order(scenario);
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({ kind: 'pr-open' });
    const implementer = scenario.harness.requestsOf('implementer');
    expect(implementer).toHaveLength(5);
    expect(implementer[4]).toMatchObject({ resumeSessionId: null, model: SETTINGS.roles.implementer.model });
    const journal = await scenario.journal();
    expect(journal.attemptEpoch).toBe(4);
    expect(journal.attempts.at(-1)).toMatchObject({ attempt: 4, mode: 'initial', outcome: 'success' });
  });

  it('waits for the pipeline to pick up an order given while the issue is being implemented', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        void orders(scenario).order({ issueNumber: ISSUE_NUMBER, path: CHECK_PATH, instruction: INSTRUCTION, operator: 'alex' });
      },
    });
    scenario.harness.script('acceptance-author', { effect: (request) => scenario.authorChecks(request) });
    scriptRewrite(scenario);
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const journal = await scenario.journal();
    expect(journal.checkRewrites).toHaveLength(1);
    expect(journal.checkRewrites[0]?.nextAttempt).toBe(1);
    expect(await states(scenario)).toContain('rewriting-check');
    const ordered = (await scenario.events.read(issueSubject(ISSUE_NUMBER), 0)).find((record) => record.type === PIPELINE_EVENTS.checkRewriteOrdered);
    expect(ordered?.payload).toMatchObject({ fromState: 'implementing' });
  });

  it('sends the issue to a human when the rewritten check does not fail on the base, and a resume runs the rewrite again', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.workspace.write(request.workingDirectory, CHECK_PATH, REWRITTEN);
        scenario.acceptancePassesOnBase = true;
      },
    });
    await order(scenario);
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toContain(`the rewritten check ${CHECK_PATH} is not valid on the base`);
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(1);

    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.workspace.write(request.workingDirectory, CHECK_PATH, `${REWRITTEN}\n`);
        scenario.acceptancePassesOnBase = false;
      },
    });
    expect(await scenario.resumer().resume(ISSUE_NUMBER)).toMatchObject({ resumedAt: 'rewriting-check' });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect((await scenario.journal()).checkRewrites).toHaveLength(1);
  });

  it('puts the frozen content of a check back when its rewrite fails, so that a rewrite of another check is accepted', async () => {
    const scenario = new PipelineScenario();
    const otherCheck = 'app/e2e/link-target.spec.ts';
    const manifest = { ...MANIFEST, checks: [MANIFEST.checks[0], { criterion: 2, paths: [CHECK_PATH, otherCheck], description: 'the link opens the conversation' }] };
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.authorChecks(request, manifest);
        scenario.workspace.write(request.workingDirectory, otherCheck, "test('the link opens the conversation', async () => {});\n");
      },
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const frozenContent = scenario.workspace.read(scenario.worktree().path, CHECK_PATH);
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.workspace.write(request.workingDirectory, CHECK_PATH, REWRITTEN);
        scenario.acceptancePassesOnBase = true;
      },
    });
    await order(scenario);
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({ kind: 'needs-human' });
    expect(scenario.workspace.read(scenario.worktree().path, CHECK_PATH)).toBe(frozenContent);

    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.workspace.write(request.workingDirectory, otherCheck, "test('the link opens the conversation in a new panel', async () => {});\n");
        scenario.acceptancePassesOnBase = false;
      },
    });
    await order(scenario, otherCheck);
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect((await scenario.journal()).checkRewrites.map((rewrite) => rewrite.path)).toEqual([otherCheck]);
  });

  it('never re-freezes another frozen check that drifted, and leaves the frozen set as it was', async () => {
    const scenario = new PipelineScenario();
    const otherCheck = 'app/e2e/link-target.spec.ts';
    const manifest = { ...MANIFEST, checks: [MANIFEST.checks[0], { criterion: 2, paths: [CHECK_PATH, otherCheck], description: 'the link opens the conversation' }] };
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.authorChecks(request, manifest);
        scenario.workspace.write(request.workingDirectory, otherCheck, "test('the link opens the conversation', async () => {});\n");
      },
    });
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        scenario.workspace.write(request.workingDirectory, otherCheck, "test.skip('the link opens the conversation', async () => {});\n");
      },
    });
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({ kind: 'needs-human' });
    const frozen = (await scenario.journal()).frozen;
    expect(frozen?.checks.map((check) => check.path)).toEqual([CHECK_PATH, otherCheck]);
    scriptRewrite(scenario);
    await order(scenario);
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toEqual({
      kind: 'needs-human',
      issueNumber: ISSUE_NUMBER,
      reason: `frozen checks other than ${CHECK_PATH} no longer match their frozen content: ${otherCheck} (modified); only the check the operator named is rewritten`,
    });
    expect((await scenario.journal()).frozen).toEqual(frozen);
    expect(scenario.harness.requestsOf('acceptance-author')).toHaveLength(1);
  });

  it('sends the issue to a human when the acceptance-author changes another file than the check', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.workspace.write(request.workingDirectory, CHECK_PATH, REWRITTEN);
        scenario.workspace.write(request.workingDirectory, PRODUCT_PATH, `${IMPLEMENTED}<span>extra</span>\n`);
      },
    });
    await order(scenario);
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome).toMatchObject({ kind: 'needs-human', reason: `the acceptance-author changed files outside ${CHECK_PATH}: ${PRODUCT_PATH}` });
    expect(scenario.baseWorkspaces.opened).toEqual([]);
  });

  it('sends the issue to a human when the acceptance-author leaves the check as it was', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    scenario.harness.script('acceptance-author', { finalText: 'Nothing to change.' });
    await order(scenario);
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({ kind: 'needs-human', reason: `the acceptance-author left ${CHECK_PATH} unchanged` });
  });

  it('refuses a rewrite outside a frozen, unmerged issue, of an unknown check or without an instruction', async () => {
    const scenario = new PipelineScenario();
    await expect(order(scenario)).rejects.toThrow('it is unknown to the factory');
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    await expect(order(scenario, 'app/e2e/other.spec.ts')).rejects.toThrow(`app/e2e/other.spec.ts is not one of its frozen checks (${CHECK_PATH})`);
    await expect(order(scenario, CHECK_PATH, '   ')).rejects.toBeInstanceOf(CheckRewriteRefusedError);
    await order(scenario);
    await expect(order(scenario)).rejects.toThrow(`a rewrite of ${CHECK_PATH} is in progress`);
  });

  it('refuses a rewrite once the pull request is merged', async () => {
    const scenario = new PipelineScenario();
    const opened = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    if (opened.kind !== 'pr-open') throw new Error('expected an open pull request');
    await new MergeOnOrder(scenario.dependencies(), scenario.headVisibility).merge({ pullRequestNumber: PULL_REQUEST, expectedHeadSha: opened.pullRequest.headSha });
    await expect(order(scenario)).rejects.toThrow('it is merged; a check is rewritten only while the issue waits on the operator or before its pull request is merged');
  });
});
