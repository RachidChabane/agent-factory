import { describe, expect, it } from 'vitest';
import { ACCEPTANCE_MANIFEST_PATH } from '../acceptance/acceptance-manifest.ts';
import { shellCommandLine } from '../acceptance/shell-quote.ts';
import type { AgentRunRequest } from '../ports.ts';
import { ResourcesUnavailableError } from '../resources/agent-run-admission.ts';
import { DECISION_REQUEST_PATH } from './decision-request.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { SpecNotValidatedError } from './pipeline-errors.ts';
import {
  ACCEPTANCE_COMMAND,
  acceptanceTestId,
  ASSERTION_FAILURE_MESSAGE,
  CHECK_CONTENT,
  CHECK_PATH,
  EVIDENCE_PATH,
  IMPLEMENTED,
  ISSUE_NUMBER,
  isStructuredAcceptance,
  issueRecord,
  LINT_COMMAND,
  LOCATOR_TIMEOUT_MESSAGE,
  MANIFEST,
  PipelineScenario,
  PRODUCT_PATH,
  reviewAnswer,
  SETUP_COMMAND,
} from './testing/pipeline-scenario.ts';

const HAPPY_PATH_STATES = [
  'spec-draft',
  'spec-validated',
  'authoring-checks',
  'checks-frozen',
  'implementing',
  'gating',
  'reviewing',
  'producing-evidence',
  'pr-open',
];

const SCRATCH_PATH = 'app/test/zz-probe.test.ts';
const FILM_REPORT_PATH = '.evidence/42/films/checkout-flow/after-report.json';

const BLOCKING_FINDING = {
  severity: 'blocking',
  category: 'criteria-coverage',
  file: PRODUCT_PATH,
  line: 1,
  summary: 'The link does not open the producing message.',
};

describe('runIssue', () => {
  it('takes a validated spec to an open pull request carrying its proof', async () => {
    const scenario = new PipelineScenario();
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);

    expect(outcome.kind).toBe('pr-open');
    expect(await scenario.states.path(ISSUE_NUMBER)).toEqual(HAPPY_PATH_STATES);
    const worktree = scenario.worktree();
    expect(worktree.branch).toBe('factory/42-link-mockups-to-their-conversation');
    expect(scenario.sourceControl.history(worktree).map((commit) => commit.message)).toEqual([
      'base',
      'test(app): add acceptance checks for #42',
      'feat(app): link mockups to their conversation\n\nRefs #42',
      'chore(evidence): add proof for #42',
    ]);
    const [, checksCommit] = scenario.sourceControl.history(worktree);
    expect(checksCommit?.snapshot.has(CHECK_PATH)).toBe(true);
    expect(checksCommit?.snapshot.has('.factory/acceptance.json')).toBe(false);
    expect(checksCommit?.snapshot.has(EVIDENCE_PATH)).toBe(false);

    const head = scenario.sourceControl.history(worktree).at(-1);
    expect(head?.snapshot.get('.evidence/42/before/1-link.png')).toBe('before-png');
    expect(head?.snapshot.get('.evidence/42/after/1-link.png')).toBe('after-png');
    expect(head?.snapshot.has('.evidence/42/before-log.txt')).toBe(true);
    expect(head?.snapshot.has('.evidence/42/after-log.txt')).toBe(true);
    expect(head?.snapshot.has('.evidence/42/diffstat.txt')).toBe(true);
    expect(head?.snapshot.has(EVIDENCE_PATH)).toBe(false);
    expect(scenario.sourceControl.pushes).toEqual([{ branch: worktree.branch, headSha: head?.sha }]);

    const [pullRequest] = scenario.github.opened;
    expect(scenario.github.opened).toHaveLength(1);
    expect(pullRequest?.draft.title).toBe('feat(app): link mockups to their conversation');
    expect(pullRequest?.draft.labels).toEqual(['factory', 'type:ui']);
    expect(pullRequest?.draft.closes).toEqual([ISSUE_NUMBER]);
    expect(pullRequest?.draft.body.startsWith('## What to look at')).toBe(true);
    expect(pullRequest?.draft.body).toContain(
      `![link.png, after](https://github.com/acme/widgets/blob/${head?.sha ?? ''}/.evidence/42/after/1-link.png?raw=true)`,
    );
    expect(scenario.events.records.filter((event) => event.type === 'pr.opened')).toEqual([
      expect.objectContaining({ subject: 'pr/100', payload: { number: 100, evidenceComplete: true, issueNumber: 42, headSha: head?.sha } }),
    ]);
  });

  it('gives each role only what it needs and a fresh run identifier per run', async () => {
    const scenario = new PipelineScenario();
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    const [author] = scenario.harness.requestsOf('acceptance-author');
    const [implementer] = scenario.harness.requestsOf('implementer');
    const [reviewer] = scenario.harness.requestsOf('reviewer');

    expect(author).toMatchObject({ frozenChecks: [], gateCommand: null, resumeSessionId: null, model: 'sonnet' });
    expect(author?.prompt).toContain('acceptance-author\nrepository=acme/widgets\nspec=# Issue #42');
    expect(implementer?.frozenChecks.map((check) => check.path)).toEqual([CHECK_PATH]);
    const confined = (command: string): string => `(${shellCommandLine(['sandbox', 'offline', '/bin/sh', '-c', command])})`;
    expect(implementer?.gateCommand).toBe(`export PATH=/usr/bin:/bin HOME=/home/factory; ${confined(LINT_COMMAND)} && ${confined(ACCEPTANCE_COMMAND)}`);
    expect(implementer?.prompt).toContain(CHECK_CONTENT.trim());
    expect(reviewer).toMatchObject({ frozenChecks: [], gateCommand: null, resumeSessionId: null });
    expect(reviewer?.prompt).toContain(`diff=diff --git a/${CHECK_PATH}`);
    expect(reviewer?.prompt).toContain(`+${CHECK_CONTENT.split('\n')[0] ?? ''}`);
    const runIds = scenario.harness.requests.map((request) => request.runId);
    expect(new Set(runIds).size).toBe(runIds.length);
  });

  it('keeps the factory evidence out of the diff the reviewer reads', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        scenario.workspace.write(request.workingDirectory, FILM_REPORT_PATH, '{"film":"previous head"}');
      },
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const [reviewer] = scenario.harness.requestsOf('reviewer');

    expect(reviewer?.prompt).toContain(`diff --git a/${PRODUCT_PATH}`);
    expect(reviewer?.prompt).not.toContain('.evidence/');
    expect(reviewer?.prompt).not.toContain('previous head');
  });

  it('runs check commands without credentials in the configured environment', async () => {
    const scenario = new PipelineScenario();
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(scenario.runner.executed.every((entry) => entry.env === scenario.settings.gate.environment)).toBe(true);
    const structured = scenario.runner.executed[1]?.command ?? '';
    expect(isStructuredAcceptance(structured)).toBe(true);
    expect(structured).toContain(`PLAYWRIGHT_JSON_OUTPUT_FILE=${scenario.worktree().path}/.factory/reports/playwright.json`);
    expect(scenario.runner.executed[1]?.argv).toEqual(['nice', '-n', '10', 'sandbox', 'offline', '/bin/sh', '-c', structured]);
    expect(scenario.runner.executed.map((entry) => entry.command)).toEqual([SETUP_COMMAND, structured, SETUP_COMMAND, LINT_COMMAND, structured]);
  });

  it('confines every check command and gives network only to the commands that declare it', async () => {
    const scenario = new PipelineScenario();
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    const worktree = scenario.worktree().path;
    expect(scenario.sandbox.scopes).toEqual([
      { workingDirectory: worktree, network: true, hostLoopback: false },
      { workingDirectory: worktree, network: false, hostLoopback: false },
      { workingDirectory: worktree, network: false, hostLoopback: false },
      { workingDirectory: worktree, network: false, hostLoopback: false },
      { workingDirectory: worktree, network: true, hostLoopback: false },
      { workingDirectory: worktree, network: false, hostLoopback: false },
      { workingDirectory: worktree, network: false, hostLoopback: false },
    ]);
    expect(scenario.runner.executed.every((entry) => entry.argv[3] === 'sandbox')).toBe(true);
  });

  it('installs the workspace before the acceptance-author so the before proof never fails for a missing tool', async () => {
    const scenario = new PipelineScenario();
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    const firstAuthorRun = scenario.harness.requests.findIndex((request) => request.role === 'acceptance-author');
    expect(firstAuthorRun).toBe(0);
    expect(scenario.runner.executed[0]?.command).toBe(SETUP_COMMAND);
    expect(await scenario.logs.read(ISSUE_NUMBER, 'before-proof.log')).toContain('2 failed: header has no conversation link');
    expect(await scenario.logs.read(ISSUE_NUMBER, 'workspace-setup.log')).toContain('Done in 2.1s');
  });

  it('sends the issue to a human when the workspace setup fails', async () => {
    const scenario = new PipelineScenario();
    scenario.setupFailuresLeft = 1;
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind).toBe('needs-human');
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toContain('the workspace setup failed at install');
    expect(scenario.harness.requests).toEqual([]);
  });

  it('feeds a setup failure inside the gate back to the implementer', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        scenario.setupFailuresLeft = 1;
      },
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('implementer')[1]?.prompt).toContain('ERR_PNPM_OUTDATED_LOCKFILE');
  });

  it('reports evidence the target repository ignores as missing instead of linking it', async () => {
    const scenario = new PipelineScenario();
    scenario.sourceControl.ignored = (path) => path.endsWith('.png') || path.startsWith('node_modules/');
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const body = scenario.github.opened[0]?.draft.body ?? '';
    expect(body).not.toContain('1-link.png?raw=true');
    expect(body).toContain('- Evidence `app/test-results/link.png` was not produced after the change.');
    expect(scenario.events.records.find((event) => event.type === 'pr.opened')?.payload).toMatchObject({ evidenceComplete: false });
  });

  it('refuses an issue whose spec is not validated and records nothing', async () => {
    const scenario = new PipelineScenario();
    scenario.github.issues.set(ISSUE_NUMBER, issueRecord({ labels: ['type:ui'] }));
    await expect(scenario.pipeline().runIssue(ISSUE_NUMBER)).rejects.toBeInstanceOf(SpecNotValidatedError);
    expect(scenario.events.records).toEqual([]);
  });

  it('waits on open blocking issues and starts once they are closed', async () => {
    const scenario = new PipelineScenario();
    scenario.github.issues.set(ISSUE_NUMBER, issueRecord({ blockedBy: [7] }));
    scenario.github.issues.set(7, { ...issueRecord({ number: 7 }), state: 'open' });
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toEqual({ kind: 'blocked', issueNumber: ISSUE_NUMBER, blockers: [7] });
    expect(scenario.harness.requests).toEqual([]);
    scenario.github.issues.set(7, { ...issueRecord({ number: 7 }), state: 'closed' });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect((await scenario.states.path(ISSUE_NUMBER)).slice(0, 4)).toEqual(['spec-draft', 'spec-validated', 'blocked', 'spec-validated']);
  });

  it('resumes the acceptance-author once with the precise reason, then sends the issue to a human when the checks still do not fail on the base', async () => {
    const scenario = new PipelineScenario();
    scenario.acceptancePassesOnBase = true;
    const reason = [
      'the frozen checks are not red for the right reason on base:',
      `- criterion 1: no assertion fails on base in ${CHECK_PATH}`,
      `- criterion 2: no assertion fails on base in ${CHECK_PATH}`,
    ].join('\n');
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toEqual({
      kind: 'needs-human',
      issueNumber: ISSUE_NUMBER,
      reason: `the before proof is not valid after 1 correction by the acceptance-author: ${reason}`,
    });
    const authors = scenario.harness.requestsOf('acceptance-author');
    expect(authors).toHaveLength(2);
    expect(authors[1]?.resumeSessionId).toBe(`session-${authors[0]?.runId ?? ''}`);
    expect(authors[1]?.prompt).toContain(reason);
    expect(scenario.harness.requestsOf('implementer')).toEqual([]);
    const journal = await scenario.journal();
    expect(journal.beforeProofCorrections).toEqual([{ correction: 1, reason, sessionId: `session-${authors[0]?.runId ?? ''}` }]);
    expect(journal.beforeProof?.exitCode).toBe(0);
    expect(await scenario.logs.read(ISSUE_NUMBER, 'before-proof.log')).toContain('2 passed');
  });

  it('freezes the checks the acceptance-author corrected once their before proof is valid, and implements against them', async () => {
    const scenario = new PipelineScenario();
    scenario.acceptancePassesOnBase = true;
    scenario.harness.script(
      'acceptance-author',
      { effect: (request) => scenario.authorChecks(request) },
      {
        effect: (request) => {
          scenario.authorChecks(request);
          scenario.acceptancePassesOnBase = false;
        },
      },
    );
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const journal = await scenario.journal();
    expect(journal.beforeProofCorrections).toHaveLength(1);
    expect(journal.beforeProof?.evaluation.valid).toBe(true);
    expect(journal.frozen?.checks.map((check) => check.path)).toEqual([CHECK_PATH]);
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(1);
  });

  it('writes the authored manifest back when the correction run leaves it out, and freezes the checks once the before proof is valid', async () => {
    const scenario = new PipelineScenario();
    scenario.acceptanceFailureMessage = LOCATOR_TIMEOUT_MESSAGE;
    scenario.harness.script(
      'acceptance-author',
      { effect: (request) => scenario.authorChecks(request) },
      {
        effect: (request) => {
          scenario.workspace.write(request.workingDirectory, CHECK_PATH, CHECK_CONTENT);
          scenario.acceptanceFailureMessage = ASSERTION_FAILURE_MESSAGE;
        },
      },
    );
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const journal = await scenario.journal();
    expect(journal.beforeProofCorrections).toHaveLength(1);
    expect(journal.beforeProof?.evaluation.valid).toBe(true);
    expect(journal.frozen?.checks.map((check) => check.path)).toEqual([CHECK_PATH]);
    expect(scenario.events.records.filter((event) => event.type === PIPELINE_EVENTS.acceptanceAuthored)).toHaveLength(2);
    expect(scenario.harness.requestsOf('acceptance-author')[1]?.prompt).toContain('Rewrite it only if the set of checks changes');
  });

  it('sends the issue to a human when the first authoring run leaves the manifest out', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('acceptance-author', { effect: (request) => scenario.workspace.write(request.workingDirectory, CHECK_PATH, CHECK_CONTENT) });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toContain(`${ACCEPTANCE_MANIFEST_PATH} was not written`);
    expect(scenario.harness.requestsOf('acceptance-author')).toHaveLength(1);
  });

  it('sends the issue to a human at once when the author session cannot be resumed', async () => {
    const scenario = new PipelineScenario();
    scenario.acceptancePassesOnBase = true;
    scenario.harness.script('acceptance-author', { sessionId: null, effect: (request) => scenario.authorChecks(request) });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toMatch(/^the before proof is not valid: the frozen checks/);
    expect(scenario.harness.requestsOf('acceptance-author')).toHaveLength(1);
  });

  it('sends the issue to a human when a check is red on base for another reason than an assertion', async () => {
    const scenario = new PipelineScenario();
    scenario.acceptanceFailureMessage = LOCATOR_TIMEOUT_MESSAGE;
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toContain(
      `${acceptanceTestId('the header links the conversation')} fails on base for another reason than an assertion: ${LOCATOR_TIMEOUT_MESSAGE}`,
    );
    expect(scenario.harness.requestsOf('implementer')).toEqual([]);
  });

  it('sends the issue to a human when the runner writes no report on base', async () => {
    const scenario = new PipelineScenario();
    scenario.runner.on(SETUP_COMMAND, () => ({ exitCode: 0, output: 'Done' }));
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toContain(
      "playwright wrote no report to .factory/reports/playwright.json: the acceptance command must hand the factory's reporter arguments to playwright",
    );
  });

  it('records each acceptance test red on base and green on the branch, in the journal, the evidence and the pull request', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const journal = await scenario.journal();
    const header = acceptanceTestId('the header links the conversation');
    expect(journal.beforeProof?.tests.map((test) => [test.id, test.criteria, test.outcome, test.failureKind])).toEqual([
      [header, [1, 2], 'failed', 'assertion'],
      [acceptanceTestId('the link opens the conversation'), [1, 2], 'failed', 'assertion'],
    ]);
    expect(journal.gates.at(-1)?.tests).toEqual([
      { id: header, outcome: 'passed' },
      { id: acceptanceTestId('the link opens the conversation'), outcome: 'passed' },
    ]);
    const bundle = scenario.workspace.read(scenario.worktree().path, `.evidence/${ISSUE_NUMBER}/acceptance-tests.json`) ?? '[]';
    expect(JSON.parse(bundle)).toContainEqual({ criterion: 1, test: header, base: 'red (assertion)', branch: 'green' });
    expect(scenario.github.opened[0]?.draft.body).toContain(`| 1 | \`${header}\` | red (assertion) | green |`);
    expect(scenario.workspace.read(scenario.worktree().path, '.factory/reports/playwright.json')).toBeUndefined();
  });

  it('fails the gate when the branch skips an acceptance test that ran on base', async () => {
    const scenario = new PipelineScenario();
    let skipNextRun = true;
    scenario.runner.onMatching(isStructuredAcceptance, (cwd) => {
      const implemented = scenario.workspace.read(cwd, PRODUCT_PATH) === IMPLEMENTED;
      const status = implemented && skipNextRun ? 'skipped' : implemented ? 'passed' : 'failed';
      if (implemented) skipNextRun = false;
      const results = [status === 'failed' ? { status, error: { message: 'Error: expect(locator).toBeVisible() failed' } } : { status }];
      const specs = ['the header links the conversation', 'the link opens the conversation'].map((title) => ({ title, file: CHECK_PATH, tests: [{ status: 'expected', results }] }));
      scenario.workspace.write(cwd, '.factory/reports/playwright.json', JSON.stringify({ config: { rootDir: cwd }, suites: [{ title: CHECK_PATH, specs }], errors: [] }));
      return { exitCode: status === 'failed' ? 1 : 0, output: status };
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const correction = scenario.harness.requestsOf('implementer')[1]?.prompt ?? '';
    expect(correction).toContain(`${acceptanceTestId('the header links the conversation')} ran on base but is skipped on the branch`);
  });

  it('refuses to push a branch whose diff carries a credential and sends the issue to a human', async () => {
    const scenario = new PipelineScenario();
    const token = ['gh', 'p_', 'Z9y8X7w6V5u4T3s2R1q0'.repeat(2)].join('');
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        scenario.workspace.write(request.workingDirectory, 'app/config.ts', `export const token = '${token}';\n`);
      },
    });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind).toBe('needs-human');
    const reason = outcome.kind === 'needs-human' ? outcome.reason : '';
    expect(reason).toContain('the secret scan refused to push factory/42-link-mockups-to-their-conversation');
    expect(reason).toContain('app/config.ts:1 github-token');
    expect(reason).not.toContain(token);
    expect(scenario.sourceControl.pushes).toEqual([]);
    expect(scenario.github.opened).toEqual([]);
  });

  it('refuses to push a branch that carries a value of the operator environment', async () => {
    const scenario = new PipelineScenario();
    const operatorValue = 'operator-figma-value-4e1b77c0a9';
    scenario.secrets.secrets = [{ source: 'keychain item figma-pat', value: operatorValue }];
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        scenario.workspace.write(request.workingDirectory, 'app/note.md', `copied ${btoa(operatorValue)}\n`);
      },
    });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toContain('app/note.md:1 known-secret: the value of keychain item figma-pat');
    expect(scenario.sourceControl.pushes).toEqual([]);
  });

  it('asks the acceptance-author once, in the same session, to fix a manifest the factory cannot use', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('acceptance-author', {
      sessionId: 'author-session',
      effect: (request) => scenario.authorChecks(request, { ...MANIFEST, evidence: ['.factory/report.xml'] }),
    });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind).toBe('pr-open');
    const [, correction] = scenario.harness.requestsOf('acceptance-author');
    expect(correction?.resumeSessionId).toBe('author-session');
    expect(correction?.prompt).toContain('evidence.0: must not be under .factory/, .evidence/, .git/');
  });

  it('sends the issue to a human when the manifest does not prove every criterion after its correction', async () => {
    const scenario = new PipelineScenario();
    const incomplete = { effect: (request: AgentRunRequest) => scenario.authorChecks(request, { ...MANIFEST, checks: [MANIFEST.checks[0]] }) };
    scenario.harness.script('acceptance-author', incomplete, incomplete);
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome).toEqual({
      kind: 'needs-human',
      issueNumber: ISSUE_NUMBER,
      reason: 'the acceptance manifest is not valid:\n- acceptance criterion 2 has no proving check',
    });
  });

  it('sends the issue to a human when the acceptance-author touched product code', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.authorChecks(request);
        scenario.workspace.write(request.workingDirectory, PRODUCT_PATH, 'changed by the author');
      },
    });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome).toMatchObject({ kind: 'needs-human', reason: `the acceptance-author changed files outside its checks: ${PRODUCT_PATH}` });
  });

  it('removes the scratch files the acceptance-author left behind, records them and carries on', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.authorChecks(request);
        scenario.workspace.write(request.workingDirectory, SCRATCH_PATH, 'probe');
      },
    });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);

    expect(outcome.kind).toBe('pr-open');
    expect(scenario.workspace.tree(scenario.worktree().path).has(SCRATCH_PATH)).toBe(false);
    expect(scenario.events.records.filter((event) => event.type === 'pipeline.author-scratch-files-removed')).toEqual([
      expect.objectContaining({ payload: { paths: [SCRATCH_PATH] } }),
    ]);
  });

  it('keeps a new file that the manifest lists as a check and records nothing', async () => {
    const scenario = new PipelineScenario();
    const second = 'app/e2e/second.spec.ts';
    const manifest = { ...MANIFEST, checks: [MANIFEST.checks[0], { ...MANIFEST.checks[1], paths: [CHECK_PATH, second] }] };
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.authorChecks(request, manifest);
        scenario.workspace.write(request.workingDirectory, second, CHECK_CONTENT);
      },
    });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);

    expect(outcome.kind).toBe('pr-open');
    expect(scenario.workspace.tree(scenario.worktree().path).has(second)).toBe(true);
    expect(scenario.events.records.some((event) => event.type === 'pipeline.author-scratch-files-removed')).toBe(false);
  });

  it('still sends the issue to a human when the author modified product code besides leaving a scratch file', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.authorChecks(request);
        scenario.workspace.write(request.workingDirectory, SCRATCH_PATH, 'probe');
        scenario.workspace.write(request.workingDirectory, PRODUCT_PATH, 'changed by the author');
      },
    });
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome).toMatchObject({ kind: 'needs-human', reason: `the acceptance-author changed files outside its checks: ${PRODUCT_PATH}` });
  });

  it('resumes the same session twice when the orchestrator gate fails twice, then passes', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 2;
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const implementer = scenario.harness.requestsOf('implementer');
    expect(implementer.map((request) => request.resumeSessionId)).toEqual([null, 'session-run-2', 'session-run-3']);
    expect(implementer[1]?.prompt).toContain('Unexpected anchor without rel');
    expect(implementer.map((request) => request.model)).toEqual(['sonnet', 'sonnet', 'sonnet']);
    expect((await scenario.journal()).decisions.map((record) => record.decision.action)).toEqual([
      'resume-same-session',
      'resume-same-session',
    ]);
  });

  it('escalates to one fresh session on the stronger profile after two corrections, then passes', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 3;
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const fresh = scenario.harness.requestsOf('implementer')[3];
    expect(fresh).toMatchObject({ resumeSessionId: null, model: 'opus', effort: 'xhigh' });
    expect(fresh?.prompt).toContain('# Earlier attempts');
    expect(fresh?.prompt).toContain('Attempt 3 failed at the gate step');
    const journal = await scenario.journal();
    expect(journal.decisions.map((record) => record.decision.action)).toEqual([
      'resume-same-session',
      'resume-same-session',
      'fresh-session-escalated',
    ]);
  });

  it('asks for a human when the escalated session fails too', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 4;
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind).toBe('needs-human');
    expect(outcome.kind === 'needs-human' ? outcome.reason : '').toContain(
      'the gate step failed on implementer attempt 4 and the retry budget is spent',
    );
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(4);
    expect(scenario.github.opened).toEqual([]);
  });

  it('counts the in-session corrections spent by the completion gate and escalates straight away', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 1;
    scenario.harness.script('implementer', { outcome: 'error', gateBlocks: 2, finalText: 'The gate still fails.' });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const implementer = scenario.harness.requestsOf('implementer');
    expect(implementer).toHaveLength(2);
    expect(implementer[1]).toMatchObject({ resumeSessionId: null, model: 'opus' });
    expect((await scenario.journal()).decisions.map((record) => [record.failure.source, record.decision.action])).toEqual([
      ['gate', 'fresh-session-escalated'],
    ]);
  });

  it('hands a decision request to a human with its full text instead of retrying', async () => {
    const scenario = new PipelineScenario();
    const question = ['Composition is not enough: nuxt-oidc-auth drops the session without an ID token.', 'Options: a patch, or a custom refresh handler.'].join(
      '\n',
    );
    scenario.harness.script('implementer', {
      outcome: 'decision-requested',
      gateBlocks: 1,
      effect: (request) => scenario.workspace.write(request.workingDirectory, DECISION_REQUEST_PATH, `${question}\n`),
    });

    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);

    expect(outcome).toEqual({
      kind: 'needs-human',
      issueNumber: ISSUE_NUMBER,
      reason: `the implementer stopped to ask for a human decision:\n\n${question}`,
    });
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(1);
    const journal = await scenario.journal();
    expect(journal.decisions).toEqual([]);
    expect(journal.attempts.at(-1)?.decisionRequest).toBe(question);
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({ kind: 'needs-human' });
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(1);
  });

  it('tells only the implementer where to write a decision request', async () => {
    const scenario = new PipelineScenario();

    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('implementer')[0]?.decisionRequestPath).toBe(DECISION_REQUEST_PATH);
    expect(scenario.harness.requestsOf('acceptance-author')[0]?.decisionRequestPath).toBeNull();
    expect(scenario.harness.requestsOf('reviewer')[0]?.decisionRequestPath).toBeNull();
  });

  it('resumes the session after a crashed run that never reached the gate', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', { outcome: 'error', gateBlocks: 0, sessionId: 'crashed-session', finalText: 'stream ended' });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const implementer = scenario.harness.requestsOf('implementer');
    expect(implementer[1]?.resumeSessionId).toBe('crashed-session');
    expect(implementer[1]?.prompt).toContain('The implementer run ended with outcome "error"');
    expect((await scenario.journal()).decisions.map((record) => record.failure.source)).toEqual(['agent']);
  });

  it('proceeds when a gate-exhausted run actually left a passing tree', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      outcome: 'error',
      gateBlocks: 2,
      effect: (request) => scenario.implement(request),
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(1);
  });

  it('returns blocking review findings to the implementer as a correction', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('reviewer', { finalText: reviewAnswer([BLOCKING_FINDING]) });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const implementer = scenario.harness.requestsOf('implementer');
    expect(implementer).toHaveLength(2);
    expect(implementer[1]?.prompt).toContain('The link does not open the producing message.');
    expect(scenario.harness.requestsOf('reviewer')).toHaveLength(2);
    expect((await scenario.journal()).decisions.map((record) => record.failure.source)).toEqual(['review']);
  });

  it('lists non-blocking findings as risks of the pull request', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('reviewer', { finalText: reviewAnswer([{ ...BLOCKING_FINDING, severity: 'non-blocking' }]) });
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(scenario.github.opened[0]?.draft.body).toContain(
      '## Risks\n\n- [criteria-coverage] (app/pages/mockup.vue:1) The link does not open the producing message.',
    );
  });

  it('sends the issue to a human when the reviewer answer is unusable', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('reviewer', { finalText: 'Looks fine to me.' });
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({
      kind: 'needs-human',
      reason: 'the reviewer answer is unusable: the review has no ```json block of findings',
    });
  });

  it('sends the issue to a human when the implementer modifies a frozen check', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        scenario.workspace.write(request.workingDirectory, CHECK_PATH, "test.skip('weakened', () => {});\n");
      },
    });
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toEqual({
      kind: 'needs-human',
      issueNumber: ISSUE_NUMBER,
      reason: `Frozen acceptance checks no longer match their frozen content: ${CHECK_PATH} (modified)`,
    });
    expect(scenario.runner.count(LINT_COMMAND)).toBe(0);
  });

  it('sends the issue to a human when the implementer deletes a frozen check', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        void scenario.workspace.remove(request.workingDirectory, CHECK_PATH);
      },
    });
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toMatchObject({
      kind: 'needs-human',
      reason: `Frozen acceptance checks no longer match their frozen content: ${CHECK_PATH} (missing)`,
    });
  });

  it('keeps implementer commits and still records the implementation', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      effect: (request) => {
        scenario.implement(request);
        scenario.sourceControl.agentCommit(scenario.worktree(), 'feat(app): link the conversation');
      },
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect(scenario.sourceControl.history(scenario.worktree()).map((commit) => commit.message)).toEqual([
      'base',
      'test(app): add acceptance checks for #42',
      'feat(app): link the conversation',
      'chore(evidence): add proof for #42',
    ]);
  });

  it('resumes from the event log after a crash without repeating finished steps', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('reviewer', { crash: new Error('the machine went to sleep') });
    await expect(scenario.pipeline().runIssue(ISSUE_NUMBER)).rejects.toThrow('the machine went to sleep');
    expect((await scenario.journal()).state).toBe('reviewing');

    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('acceptance-author')).toHaveLength(1);
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(1);
    expect(scenario.harness.requestsOf('reviewer')).toHaveLength(2);
    expect(scenario.runner.countMatching(isStructuredAcceptance)).toBe(2);
    expect(await scenario.states.path(ISSUE_NUMBER)).toEqual(HAPPY_PATH_STATES);
  });

  it('finds the pull request it already opened when the creation answer was lost', async () => {
    const scenario = new PipelineScenario();
    scenario.github.failNextOpenAfterCreation = true;
    await expect(scenario.pipeline().runIssue(ISSUE_NUMBER)).rejects.toThrow('connection reset');
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome).toMatchObject({ kind: 'pr-open', pullRequest: { number: 100 } });
    expect(scenario.github.opened).toHaveLength(1);
    expect(scenario.events.records.filter((event) => event.type === 'pr.opened')).toHaveLength(1);
  });

  it('starts no agent run while resources are short and resumes once they recover', async () => {
    const scenario = new PipelineScenario();
    scenario.resources.current = { freeMemoryPercent: 22, pressure: 'warn' };
    await expect(scenario.pipeline().runIssue(ISSUE_NUMBER)).rejects.toBeInstanceOf(ResourcesUnavailableError);
    expect(scenario.harness.requests).toEqual([]);
    expect((await scenario.journal()).state).toBe('authoring-checks');
    scenario.resources.current = { freeMemoryPercent: 64, pressure: 'normal' };
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
  });

  it('reports an open pull request again without doing any work', async () => {
    const scenario = new PipelineScenario();
    const first = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    const requests = scenario.harness.requests.length;
    expect(await scenario.pipeline().runIssue(ISSUE_NUMBER)).toEqual(first);
    expect(scenario.harness.requests).toHaveLength(requests);
  });

  it('stops before the next run when the operator aborts', async () => {
    const scenario = new PipelineScenario();
    const controller = new AbortController();
    scenario.harness.script('acceptance-author', {
      effect: (request) => {
        scenario.authorChecks(request);
        controller.abort();
      },
    });
    await expect(scenario.pipeline({ signal: controller.signal }).runIssue(ISSUE_NUMBER)).rejects.toThrow('was stopped');
    expect((await scenario.journal()).state).toBe('authoring-checks');
  });
});
