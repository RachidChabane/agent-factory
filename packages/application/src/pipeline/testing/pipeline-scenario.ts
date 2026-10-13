import { DEFAULT_ISSUE_TYPES, IssueTypology, type IssueSpec } from '@agent-factory/domain';
import { DEFAULT_PROJECT_CONVENTIONS, type ProjectConventions } from '../../conventions/project-conventions.ts';
import { ISSUE_OPENED_AT, StubPromptCatalog } from '../../audit/testing/fakes.ts';
import { SteppingClock } from '../../runs/test-support.ts';
import { RUNNER_REPORTING } from '../../acceptance/test-reports/test-report-reader.ts';
import { ACCEPTANCE_REPORT_DIRECTORY } from '../../acceptance/structured-command.ts';
import type { AgentRunRequest, IssueRecord, Worktree } from '../../ports.ts';
import { MarkdownSpecReader } from '../../spec/markdown-spec-reader.ts';
import { renderSpecBody } from '../../spec/render-spec-body.ts';
import { HEAD_VISIBILITY_ATTEMPTS, HEAD_VISIBILITY_DELAY_MS, type HeadVisibilityPolicy } from '../head-visibility.ts';
import { MergeOnOrder } from '../merge-on-order.ts';
import { ResumeIssue } from '../resume-issue.ts';
import type { PipelineDependencies } from '../pipeline-dependencies.ts';
import { loadJournal, type PipelineJournal } from '../pipeline-journal.ts';
import type { PipelineSettings } from '../pipeline-settings.ts';
import { IssuePipeline, type IssuePipelineOptions } from '../run-issue.ts';
import { webForgeFileLinks } from './file-links.ts';
import { StackSlots } from '../issue-stack.ts';
import {
  AdjustableResources,
  EventSourcedIssueStates,
  InMemoryBaseWorkspaces,
  InMemoryEventStore,
  InMemoryGitHub,
  InMemoryLogArchive,
  InMemorySourceControl,
  InMemoryWorkspace,
  InMemoryWorktreePool,
  ScriptedCommandRunner,
  ScriptedServiceProcesses,
  RecordingSandbox,
  RecordingSleeper,
  ScriptedRoleHarness,
  SequentialIds,
  StaticSecrets,
} from './pipeline-fakes.ts';

export const ISSUE_NUMBER = 42;
export const UI_TYPE = 'ui';
export const APP_SCOPE = 'app';
export const CHECK_PATH = 'app/e2e/link.spec.ts';
export const CHECK_CONTENT = "test('the header links the conversation', async () => {});\n";
export const PRODUCT_PATH = 'app/pages/mockup.vue';
export const IMPLEMENTED = '<a href="/conversation">Conversation</a>\n';
export const EVIDENCE_PATH = 'app/test-results/link.png';
export const LINT_COMMAND = 'mise run lint';
export const SETUP_COMMAND = 'pnpm install --frozen-lockfile';
export const INSTALLED_MARKER = 'node_modules/.modules.yaml';
export const IGNORED_PREFIXES: readonly string[] = ['node_modules/', 'app/test-results/'];
export const ACCEPTANCE_ARGV = ['pnpm', 'exec', 'playwright', 'test', CHECK_PATH] as const;
export const ACCEPTANCE_COMMAND = ACCEPTANCE_ARGV.join(' ');
export const STRUCTURED_ACCEPTANCE_SUFFIX = `${ACCEPTANCE_COMMAND} ${RUNNER_REPORTING.playwright.arguments('').join(' ')}`;
export const PLAYWRIGHT_REPORT_PATH = `${ACCEPTANCE_REPORT_DIRECTORY}/${RUNNER_REPORTING.playwright.reportFile}`;
export const ACCEPTANCE_TEST_TITLES = ['the header links the conversation', 'the link opens the conversation'] as const;
export const ASSERTION_FAILURE_MESSAGE = 'Error: expect(locator).toBeVisible() failed';
export const LOCATOR_TIMEOUT_MESSAGE = 'TimeoutError: locator.click: Timeout 5000ms exceeded.';

export function isStructuredAcceptance(command: string): boolean {
  return command.endsWith(STRUCTURED_ACCEPTANCE_SUFFIX);
}

export function acceptanceTestId(title: string): string {
  return `${CHECK_PATH} > ${title}`;
}
export const MANIFEST_PATH = '.factory/acceptance.json';
export const SCENARIO_START = new Date('2026-10-12T12:00:00.000Z');
export const NO_FINDINGS = 'The change is sound.\n\n```json\n{ "findings": [] }\n```';

export const SPEC: IssueSpec = {
  number: ISSUE_NUMBER,
  title: 'Link mockups to their conversation',
  type: 'ui',
  need: 'Operators lose track of which conversation produced a mockup.',
  acceptanceCriteria: ['The mockup header links the conversation.', 'The link opens the conversation.'],
  outOfScope: ['Editing the conversation from the mockup.'],
  expectedProof: 'A Playwright journey with a screenshot of the header.',
  dependsOn: [],
  commitKind: null,
  films: [],
};

export const MANIFEST = {
  runner: 'playwright',
  checks: [
    { criterion: 1, paths: [CHECK_PATH], description: 'the header shows the link' },
    { criterion: 2, paths: [CHECK_PATH], description: 'the link opens the conversation' },
  ],
  command: [...ACCEPTANCE_ARGV],
  evidence: [EVIDENCE_PATH],
};

/** The default conventions, with the user-interface issues of this repository scoped to its app. */
export const SCENARIO_CONVENTIONS: ProjectConventions = {
  ...DEFAULT_PROJECT_CONVENTIONS,
  typology: new IssueTypology(
    DEFAULT_ISSUE_TYPES.map((type) => (type.id === UI_TYPE ? { ...type, commit: { ...type.commit, scope: APP_SCOPE } } : type)),
  ),
};

export const SETTINGS: PipelineSettings = {
  repository: { owner: 'acme', name: 'widgets' },
  fileLinks: webForgeFileLinks('https://github.com', 'acme', 'widgets'),
  stack: null,
  setupCommands: [{ name: 'install', run: SETUP_COMMAND, network: { reason: 'downloads the dependencies from the registry' } }],
  roles: {
    'acceptance-author': { model: 'sonnet', effort: 'medium', maxBudgetUsd: 2, maxTurns: 40, timeoutMs: 600_000 },
    implementer: { model: 'sonnet', effort: 'high', maxBudgetUsd: 5, maxTurns: 80, timeoutMs: 1_200_000 },
    reviewer: { model: 'sonnet', effort: 'medium', maxBudgetUsd: 1, maxTurns: 20, timeoutMs: 600_000 },
  },
  implementerEscalation: { model: 'opus', effort: 'xhigh' },
  gate: {
    commandsBeforeAcceptance: [{ name: 'lint', run: LINT_COMMAND }],
    commandsAfterAcceptance: [],
    commandTimeoutMs: 900_000,
    environment: { PATH: '/usr/bin:/bin', HOME: '/home/factory' },
    niceness: 10,
  },
  conventions: SCENARIO_CONVENTIONS,
  evidenceCacheDirectory: '/factory/evidence',
  resources: { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' },
};

export function issueRecord(overrides: Partial<IssueRecord> = {}): IssueRecord {
  return {
    number: ISSUE_NUMBER,
    title: SPEC.title,
    body: renderSpecBody(SPEC, SCENARIO_CONVENTIONS),
    labels: ['type:ui', 'spec:validated'],
    state: 'open',
    blockedBy: [],
    createdAt: ISSUE_OPENED_AT,
    updatedAt: ISSUE_OPENED_AT,
    ...overrides,
  };
}

export function reviewAnswer(findings: readonly unknown[]): string {
  return `Review done.\n\n\`\`\`json\n${JSON.stringify({ findings })}\n\`\`\``;
}

export class PipelineScenario {
  readonly workspace = new InMemoryWorkspace();
  readonly sourceControl = new InMemorySourceControl(
    this.workspace,
    new Map([['README.md', '# widgets\n'], [PRODUCT_PATH, '<h1>Mockup</h1>\n']]),
    (path) => IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix)),
  );
  readonly pool = new InMemoryWorktreePool(this.sourceControl);
  readonly github = new InMemoryGitHub(this.sourceControl);
  readonly harness = new ScriptedRoleHarness();
  readonly runner = new ScriptedCommandRunner();
  /** The time every event of the scenario is recorded at; tests move it to age the log. */
  readonly clock = new SteppingClock(SCENARIO_START);
  readonly events = new InMemoryEventStore(this.clock);
  readonly states = new EventSourcedIssueStates(this.events);
  readonly logs = new InMemoryLogArchive();
  readonly resources = new AdjustableResources();
  readonly ids = new SequentialIds();
  readonly sleeper = new RecordingSleeper();
  readonly headVisibility: HeadVisibilityPolicy = {
    sleeper: this.sleeper,
    signal: new AbortController().signal,
    attempts: HEAD_VISIBILITY_ATTEMPTS,
    delayMs: HEAD_VISIBILITY_DELAY_MS,
  };
  readonly sandbox = new RecordingSandbox();
  readonly secrets = new StaticSecrets();
  readonly baseWorkspaces = new InMemoryBaseWorkspaces(this.sourceControl, this.workspace);
  readonly services = new ScriptedServiceProcesses();
  readonly stackSlots = new StackSlots();
  readonly settings: PipelineSettings;
  lintFailuresLeft = 0;
  setupFailuresLeft = 0;
  acceptancePassesOnBase = false;
  acceptanceFailureMessage = ASSERTION_FAILURE_MESSAGE;

  constructor(settings: PipelineSettings = SETTINGS) {
    this.settings = settings;
    this.github.issues.set(ISSUE_NUMBER, issueRecord());
    this.harness.fallback('acceptance-author', { effect: (request) => this.authorChecks(request) });
    this.harness.fallback('implementer', { effect: (request) => this.implement(request) });
    this.harness.fallback('reviewer', { finalText: NO_FINDINGS });
    this.runner.on(LINT_COMMAND, () => this.lint());
    this.runner.on(SETUP_COMMAND, (cwd) => this.install(cwd));
    this.runner.on(ACCEPTANCE_COMMAND, (cwd) => this.acceptance(cwd));
    this.runner.onMatching(isStructuredAcceptance, (cwd) => this.structuredAcceptance(cwd));
  }

  dependencies(): PipelineDependencies {
    return {
      github: this.github,
      specReader: new MarkdownSpecReader(this.settings.conventions),
      pool: this.pool,
      sourceControl: this.sourceControl,
      harness: this.harness,
      roles: new StubPromptCatalog(),
      runner: this.runner,
      sandbox: this.sandbox,
      knownSecrets: this.secrets,
      events: this.events,
      states: this.states,
      files: this.workspace,
      logs: this.logs,
      resources: this.resources,
      ids: this.ids,
      baseWorkspaces: this.baseWorkspaces,
      services: this.services,
      stackSlots: this.stackSlots,
    };
  }

  pipeline(options: IssuePipelineOptions = {}): IssuePipeline {
    return new IssuePipeline(this.dependencies(), this.settings, options);
  }

  /** Resumes issues of this scenario. */
  resumer(): ResumeIssue {
    return new ResumeIssue(this.dependencies(), { conventions: this.settings.conventions });
  }

  mergeOnOrder(): MergeOnOrder {
    return new MergeOnOrder(this.dependencies(), this.headVisibility);
  }

  journal(): Promise<PipelineJournal> {
    return loadJournal(this.events, ISSUE_NUMBER);
  }

  worktree(): Worktree {
    const worktree = this.pool.leases.get(ISSUE_NUMBER);
    if (worktree === undefined) throw new Error('no worktree leased');
    return worktree;
  }

  authorChecks(request: AgentRunRequest, manifest: unknown = MANIFEST): void {
    this.workspace.write(request.workingDirectory, CHECK_PATH, CHECK_CONTENT);
    this.workspace.write(request.workingDirectory, MANIFEST_PATH, JSON.stringify(manifest));
    this.workspace.write(request.workingDirectory, EVIDENCE_PATH, 'author-run-png');
  }

  implement(request: AgentRunRequest): void {
    this.workspace.write(request.workingDirectory, PRODUCT_PATH, IMPLEMENTED);
  }

  private install(cwd: string): { exitCode: number; output: string } {
    if (this.setupFailuresLeft > 0) {
      this.setupFailuresLeft -= 1;
      return { exitCode: 1, output: 'ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile"' };
    }
    this.workspace.write(cwd, INSTALLED_MARKER, 'installed');
    return { exitCode: 0, output: 'Done in 2.1s' };
  }

  private lint(): { exitCode: number; output: string } {
    if (this.lintFailuresLeft > 0) {
      this.lintFailuresLeft -= 1;
      return { exitCode: 1, output: 'app/pages/mockup.vue:1:1 error  Unexpected anchor without rel' };
    }
    return { exitCode: 0, output: 'lint ok' };
  }

  private structuredAcceptance(cwd: string): { exitCode: number; output: string } {
    const result = this.acceptance(cwd);
    if (this.workspace.read(cwd, INSTALLED_MARKER) === undefined) return result;
    const passing = result.exitCode === 0;
    const tests = ACCEPTANCE_TEST_TITLES.map((title) => ({
      title,
      file: CHECK_PATH,
      tests: [{ status: passing ? 'expected' : 'unexpected', results: [passing ? { status: 'passed' } : { status: 'failed', error: { message: this.acceptanceFailureMessage } }] }],
    }));
    this.workspace.write(cwd, PLAYWRIGHT_REPORT_PATH, JSON.stringify({ config: { rootDir: cwd }, suites: [{ title: CHECK_PATH, specs: tests }], errors: [] }));
    return result;
  }

  private acceptance(cwd: string): { exitCode: number; output: string } {
    if (this.workspace.read(cwd, INSTALLED_MARKER) === undefined) return { exitCode: 1, output: 'Command "playwright" not found' };
    const implemented = this.workspace.read(cwd, PRODUCT_PATH) === IMPLEMENTED;
    this.workspace.write(cwd, EVIDENCE_PATH, implemented ? 'after-png' : 'before-png');
    return implemented || this.acceptancePassesOnBase
      ? { exitCode: 0, output: '2 passed' }
      : { exitCode: 1, output: '2 failed: header has no conversation link' };
  }
}
