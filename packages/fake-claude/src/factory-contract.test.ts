import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import type { AgentRunRequest } from '../../application/src/ports.ts';
import { parseAuditVerdict } from '../../application/src/audit/audit-verdict.ts';
import { parseChallengeAnswer } from '../../application/src/requests/challenge-answer.ts';
import { readReviewFindings } from '../../application/src/review/review-findings.ts';
import { buildChildEnvironment } from '../../adapters/src/claude/child-environment.ts';
import { buildClaudeArguments } from '../../adapters/src/claude/claude-invocation.ts';
import { decideOutcome, gateBlocksOf, outcomeOfResult } from '../../adapters/src/claude/run-outcome.ts';
import { renderRunSettings } from '../../adapters/src/claude/run-settings.ts';
import { RunTranscript } from '../../adapters/src/claude/stream/run-transcript.ts';
import { parseStreamLine } from '../../adapters/src/claude/stream/stream-parser.ts';
import {
  AssistantSchema,
  AssistantUsageSchema,
  HookResponseSchema,
  LineEnvelopeSchema,
  PermissionDeniedSchema,
  RateLimitEventSchema,
  ResultSchema,
  SystemInitSchema,
  TextBlockSchema,
  ToolResultBlockSchema,
  ToolUseBlockSchema,
  UserSchema,
} from '../../adapters/src/claude/stream/stream-schemas.ts';
import { USAGE_REPORT_ARGUMENTS, parseUsageReport } from '../../adapters/src/claude/usage-report.ts';
import {
  GatePolicySchema,
  HOOK_SCRIPTS,
  isStopBlock,
  parseGateDecisionLog,
  sha256Hex,
  type GateDecision,
} from '../../plugin/src/index.ts';
import { parseCommandLine } from './cli/command-line.ts';
import { hookOutputOf, stopDecisionOf } from './hooks/hook-decisions.ts';
import { detectRole } from './scenario/role-detection.ts';
import { DEFAULT_ROLE_SIGNATURES, FAKE_ROLES } from './scenario/scenario.ts';
import { runFakeClaude, runFakeClaudeWithoutStandardInput, type Completed } from './test-support/fake-claude-process.ts';
import { dig, digList, digString } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { STOP_HOOK_CASES } from './test-support/stop-hook-cases.ts';
import { linesOfShape } from './test-support/stream-shape.ts';

const ROLE_TEMPLATES = join(import.meta.dirname, '..', '..', 'plugin', 'roles');
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const GATE_TIMEOUT_MS = 30_000;
const STOP_HOOK_BLOCK_CAP = 2;
const FROZEN_CHECK_PATH = 'checks/acceptance.txt';
const FROZEN_CHECK_CONTENT = 'done.txt contains the word ok\n';
const DECISION_REQUEST_PATH = '.factory/decision-request.md';
const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree.';
const TIMING_TOLERANCE_MS = 60_000;

describe('the stream, read by the schemas and the parser of the factory', () => {
  let sandbox: Sandbox;
  let run: Completed;

  before(async () => {
    sandbox = await createSandbox();
    run = await runUnderFactoryHooks(sandbox, {
      attempts: [
        {
          steps: [
            { say: 'Starting.' },
            { write: { path: FROZEN_CHECK_PATH, content: 'tampered' } },
            { write: { path: 'src/work.txt', content: 'work in progress' } },
            { delete: 'src/missing.txt' },
          ],
          final: 'First attempt.',
        },
        { steps: [{ write: { path: 'done.txt', content: 'ok\n' } }], final: 'Second attempt.' },
      ],
      gateCommand: 'grep -q ok done.txt',
      decisionRequestPath: null,
    }).then((outcome) => outcome.run);
  });

  after(async () => {
    await sandbox.dispose();
  });

  it('validates every line against the schema of its kind', () => {
    for (const line of run.lines) {
      LineEnvelopeSchema.parse(line);
      const kind = [dig(line, 'type'), dig(line, 'subtype')].filter((part) => part !== undefined).join(':');
      switch (kind) {
        case 'system:init':
          SystemInitSchema.parse(line);
          break;
        case 'system:hook_response':
          HookResponseSchema.parse(line);
          break;
        case 'system:permission_denied':
          PermissionDeniedSchema.parse(line);
          break;
        case 'assistant':
          AssistantSchema.parse(line);
          AssistantUsageSchema.parse(line);
          digList(line, 'message', 'content').forEach((block) =>
            dig(block, 'type') === 'text' ? TextBlockSchema.parse(block) : ToolUseBlockSchema.parse(block),
          );
          break;
        case 'user':
          UserSchema.parse(line);
          break;
        case 'rate_limit_event':
          RateLimitEventSchema.parse(line);
          break;
        case 'result:success':
          ResultSchema.parse(line);
          break;
        case 'system:hook_started':
          break;
        default:
          assert.fail(`the fake printed a line of a kind the factory does not know: ${kind}`);
      }
    }
    for (const line of linesOfShape(run.lines, 'tool-result')) {
      digList(line, 'message', 'content').forEach((block) => ToolResultBlockSchema.parse(block));
    }
  });

  it('translates every line into events, and leaves as raw only the lines the factory keeps raw', () => {
    const keptRaw = new Set(['user', 'result:success']);
    for (const line of run.stdout.split('\n').filter((text) => text !== '')) {
      const parsed = parseStreamLine(line);
      const value: unknown = JSON.parse(line);
      const kind = [dig(value, 'type'), dig(value, 'subtype')].filter((part) => part !== undefined).join(':');
      const raw = parsed.events.some((event) => event.kind === 'raw');
      if (raw) {
        assert.ok(keptRaw.has(kind) || keptRaw.has(String(dig(value, 'type'))), `unexpected raw line: ${kind}`);
      }
    }
  });

  it('feeds the live usage and the result of the factory consistently', () => {
    const events: { kind: string; usage?: unknown; turns?: number }[] = [];
    const transcript = new RunTranscript(MAX_LINE_BYTES, (event) => events.push(event), () => undefined);
    transcript.push(Buffer.from(run.stdout));
    transcript.end();

    const result = transcript.result;
    assert.ok(result !== null);
    assert.equal(outcomeOfResult(result), 'success');
    assert.equal(transcript.sessionId, digString(run.lines[0], 'session_id'));
    const progress = events.filter((event) => event.kind === 'progress').at(-1);
    assert.deepEqual(progress?.usage, {
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      cacheReadTokens: result.usage?.cache_read_input_tokens,
      cacheCreationTokens: result.usage?.cache_creation_input_tokens,
    });
    assert.equal(progress?.turns, result.num_turns);
    assert.equal(transcript.lastAssistantText, 'Second attempt.');
    assert.equal(events.filter((event) => event.kind === 'rate-limit').length, 1);
  });
});

describe('a run under the real hooks of the factory', () => {
  let sandbox: Sandbox;

  beforeEach(async () => {
    sandbox = await createSandbox();
  });

  afterEach(async () => {
    await sandbox.dispose();
  });

  it('is accepted once the gate that failed first passes, and refuses the write to a frozen check', async () => {
    const attempts = [
      {
        steps: [{ write: { path: FROZEN_CHECK_PATH, content: 'tampered' } }, { write: { path: 'src/work.txt', content: 'wip' } }],
        final: 'First attempt.',
      },
      { steps: [{ write: { path: 'done.txt', content: 'ok\n' } }], final: 'Second attempt.' },
    ];
    const outcome = await runUnderFactoryHooks(sandbox, { attempts, gateCommand: 'grep -q ok done.txt', decisionRequestPath: null });

    assert.equal(outcome.verdict, 'success');
    assert.deepEqual(
      outcome.decisions.map((decision) => [decision.passed, decision.stopHookActive, decision.failure]),
      [
        [false, false, 'gate-failed'],
        [true, true, null],
      ],
    );
    assert.deepEqual(outcome.stopHookBlocks, [true, false]);
    assert.equal(gateBlocksOf(outcome.decisions), 1);

    const denials = linesOfShape(outcome.run.lines, 'denied');
    assert.equal(denials.length, 1);
    assert.equal(digString(denials[0], 'message'), `${FROZEN_CHECK_PATH} is a frozen acceptance check and cannot be modified.`);
    assert.equal(await readFile(join(sandbox.worktree, FROZEN_CHECK_PATH), 'utf8'), FROZEN_CHECK_CONTENT);
    assert.equal(await readFile(join(sandbox.worktree, 'done.txt'), 'utf8'), 'ok\n');

    const [feedback] = linesOfShape(outcome.run.lines, 'feedback');
    assert.match(digString(feedback, 'message', 'content', 0, 'text'), /The completion gate failed\. Fix what is reported below, then finish again\./);
  });

  it('ends in error when the gate never passes within the allowed number of corrections', async () => {
    const attempts = [{ final: 'Attempt one.' }, { final: 'Attempt two.' }, { final: 'Attempt three.' }, { final: 'Attempt four.' }];
    const outcome = await runUnderFactoryHooks(sandbox, { attempts, gateCommand: 'exit 1', decisionRequestPath: null });
    assert.equal(outcome.decisions.length, STOP_HOOK_BLOCK_CAP + 1);
    assert.deepEqual(outcome.stopHookBlocks, [true, true, true]);
    assert.equal(outcome.verdict, 'error');
    assert.equal(digString(outcome.run.lines.at(-1), 'result'), 'Attempt three.');
  });

  it('lets an agent that asks a human end its run, which the factory reads as a requested decision', async () => {
    const attempts = [
      { steps: [{ write: { path: DECISION_REQUEST_PATH, content: 'Should the page list owners by name or by team?\n' } }], final: 'I need a decision.' },
    ];
    const outcome = await runUnderFactoryHooks(sandbox, { attempts, gateCommand: 'exit 1', decisionRequestPath: DECISION_REQUEST_PATH });
    assert.deepEqual(
      outcome.decisions.map((decision) => decision.failure),
      ['decision-requested'],
    );
    assert.deepEqual(outcome.stopHookBlocks, [false]);
    assert.equal(outcome.verdict, 'decision-requested');
  });
});

describe('the /usage probe of the factory', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
    await sandbox.writeScenario({ usage: { session: { percent: 41, resetsInHours: 2 } } });
  });

  after(async () => {
    await sandbox.dispose();
  });

  it('reads the report the fake prints for the arguments the probe passes', () => {
    const before = Date.now();
    const probe = runFakeClaudeWithoutStandardInput(sandbox, { flags: USAGE_REPORT_ARGUMENTS });
    assert.equal(probe.status, 0, probe.stderr);
    const limits = parseUsageReport(probe.stdout);
    assert.deepEqual(
      limits.map((limit) => [limit.kind, limit.scope, limit.utilization]),
      [
        ['session', null, 0.41],
        ['weekly_all', null, 0.34],
        ['weekly_scoped', 'Opus', 0.08],
      ],
    );
    const [session] = limits;
    const resetsAt = session?.resetsAt;
    assert.ok(resetsAt instanceof Date);
    assert.ok(Math.abs(resetsAt.getTime() - (before + 2 * 3_600_000)) < TIMING_TOLERANCE_MS);
  });
});

describe('the roles of the factory', () => {
  it('recognises the role of every prompt template the factory ships', async () => {
    for (const role of FAKE_ROLES) {
      const template = await readFile(join(ROLE_TEMPLATES, `${role}.md`), 'utf8');
      assert.equal(detectRole(template, DEFAULT_ROLE_SIGNATURES), role);
    }
  });

  describe('answers that the factory parses', () => {
    let sandbox: Sandbox;

    before(async () => {
      sandbox = await createSandbox();
      await sandbox.writeScenario({});
    });

    after(async () => {
      await sandbox.dispose();
    });

    async function answerTo(role: (typeof FAKE_ROLES)[number]): Promise<string> {
      const template = await readFile(join(ROLE_TEMPLATES, `${role}.md`), 'utf8');
      const answer = runFakeClaude(sandbox, { prompt: template });
      assert.equal(answer.status, 0, answer.stderr);
      return digString(answer.lines.at(-1), 'result');
    }

    it('reads the built-in review as a review without finding', async () => {
      assert.deepEqual(readReviewFindings(await answerTo('reviewer')), { valid: true, findings: [] });
    });

    it('reads the built-in audit as the verdict keep', async () => {
      const parsed = parseAuditVerdict(await answerTo('auditor'));
      assert.ok(parsed.ok);
      assert.equal(parsed.report.verdict, 'keep');
      assert.equal(parsed.report.proposedFix, null);
    });

    it('reads the built-in challenge as one kept item without specification', async () => {
      const parsed = parseChallengeAnswer(await answerTo('challenger'));
      assert.ok(parsed.ok);
      assert.deepEqual(
        parsed.answer.items.map((item) => item.verdict),
        ['keep'],
      );
      assert.deepEqual(parsed.answer.specs, []);
    });

    it('writes nothing for the roles that have no machine-read answer', async () => {
      for (const role of ['acceptance-author', 'implementer'] as const) {
        assert.ok((await answerTo(role)).length > 0);
      }
    });
  });
});

describe('the arguments and the hooks of the factory', () => {
  const REQUEST: AgentRunRequest = {
    runId: 'run-1',
    context: { subject: { kind: 'issue', id: '7' }, attempt: 0, branch: null },
    account: null,
    role: 'implementer',
    model: 'haiku',
    effort: 'low',
    workingDirectory: '/work',
    prompt: IMPLEMENTER_PROMPT,
    appendSystemPrompt: 'Follow the repository rules.',
    allowedTools: [],
    mcpServers: {},
    resumeSessionId: null,
    maxBudgetUsd: 1,
    maxTurns: 10,
    frozenChecks: [],
    gateCommand: null,
    decisionRequestPath: null,
    timeoutMs: GATE_TIMEOUT_MS,
  };
  const FILES = { settingsPath: '/runs/run-1/settings.json', mcpConfigPath: '/runs/run-1/mcp.json', appendSystemPromptPath: '/runs/run-1/prompt.md' };
  const TOOLS = { availableTools: ['Read', 'Write', 'Bash'], allowedTools: ['Read', 'Write'] };

  it('reads the flags that buildClaudeArguments produces', () => {
    const parsed = parseCommandLine([...buildClaudeArguments(REQUEST, FILES, TOOLS), '--scenario', 'scenario.json', '--state', 'state']);
    assert.equal(parsed.model, 'haiku');
    assert.equal(parsed.effort, 'low');
    assert.equal(parsed.permissionMode, 'dontAsk');
    assert.equal(parsed.settings, FILES.settingsPath);
    assert.equal(parsed.toolList, 'Read,Write,Bash');
    assert.equal(parsed.resumeSessionId, null);
    assert.equal(parsed.promptArgument, null);
  });

  it('reads the session to resume from the arguments of a resumed run', () => {
    const parsed = parseCommandLine(buildClaudeArguments({ ...REQUEST, resumeSessionId: 'session-1' }, FILES, TOOLS));
    assert.equal(parsed.resumeSessionId, 'session-1');
  });

  for (const { name, execution, blocked } of STOP_HOOK_CASES) {
    it(`blocks exactly when the factory reads a block: ${name}`, () => {
      assert.equal(isStopBlock(execution.exitCode, hookOutputOf(execution)), blocked);
      assert.equal(stopDecisionOf(execution).blocked, blocked);
    });
  }
});

interface FactoryRun {
  readonly attempts: readonly object[];
  readonly gateCommand: string;
  readonly decisionRequestPath: string | null;
}

interface FactoryRunOutcome {
  readonly run: Completed;
  readonly decisions: readonly GateDecision[];
  readonly stopHookBlocks: readonly boolean[];
  readonly verdict: ReturnType<typeof decideOutcome>;
}

/** Runs the fake the way the harness launches claude: its argument list, its settings, its environment and its real hooks. */
async function runUnderFactoryHooks(sandbox: Sandbox, factoryRun: FactoryRun): Promise<FactoryRunOutcome> {
  const runDirectory = sandbox.path('run');
  await mkdir(runDirectory, { recursive: true });
  await mkdir(join(sandbox.worktree, 'checks'), { recursive: true });
  await writeFile(join(sandbox.worktree, FROZEN_CHECK_PATH), FROZEN_CHECK_CONTENT);
  await sandbox.writeScenario({ entries: [{ role: 'implementer', when: 'acme/widgets', attempts: factoryRun.attempts }] });

  const policyPath = join(runDirectory, 'gate-policy.json');
  const decisionLogPath = join(runDirectory, 'gate-decisions.jsonl');
  const settingsPath = join(runDirectory, 'settings.json');
  const policy = GatePolicySchema.parse({
    worktree: sandbox.worktree,
    frozenChecks: [{ path: FROZEN_CHECK_PATH, sha256: sha256Hex(FROZEN_CHECK_CONTENT) }],
    gateCommand: factoryRun.gateCommand,
    gateTimeoutMs: GATE_TIMEOUT_MS,
    decisionLogPath,
    decisionRequestFile: factoryRun.decisionRequestPath === null ? null : join(sandbox.worktree, factoryRun.decisionRequestPath),
  });
  await writeFile(policyPath, JSON.stringify(policy));
  const rendered = renderRunSettings({
    role: 'implementer',
    extraAllowedTools: [],
    worktree: sandbox.worktree,
    frozenCheckPaths: [FROZEN_CHECK_PATH],
    protectedDirectories: [],
    hookRuntime: process.execPath,
    hookScripts: HOOK_SCRIPTS,
    policyPath,
    gateRequired: true,
    gateTimeoutMs: GATE_TIMEOUT_MS,
    sandboxAllowedDomains: [],
    writableDirectories: [],
    deniedReadPaths: [],
    readablePaths: [],
    shellCommands: [],
    unixSockets: [],
    socketsAllOrNothing: false,
    references: [],
  });
  await writeFile(settingsPath, JSON.stringify(rendered.settings));

  const flags = buildClaudeArguments(
    {
      runId: 'run-1',
      context: { subject: { kind: 'issue', id: '7' }, attempt: 0, branch: null },
      account: null,
      role: 'implementer',
      model: 'haiku',
      effort: 'low',
      workingDirectory: sandbox.worktree,
      prompt: IMPLEMENTER_PROMPT,
      appendSystemPrompt: '',
      allowedTools: [],
      mcpServers: {},
      resumeSessionId: null,
      maxBudgetUsd: 1,
      maxTurns: 10,
      frozenChecks: [],
      gateCommand: factoryRun.gateCommand,
      decisionRequestPath: factoryRun.decisionRequestPath,
      timeoutMs: GATE_TIMEOUT_MS,
    },
    {
      settingsPath,
      mcpConfigPath: join(runDirectory, 'mcp-config.json'),
      appendSystemPromptPath: join(runDirectory, 'append-system-prompt.md'),
    },
    rendered,
  );
  const environment = buildChildEnvironment(
    { PATH: process.env['PATH'], HOME: sandbox.root },
    {
      githubConfigDirectory: join(runDirectory, 'gh-config'),
      claudeConfigDirectory: null,
      maxSubagentSpawnDepth: 1,
      maxConcurrentSubagents: 2,
      stopHookBlockCap: STOP_HOOK_BLOCK_CAP,
    },
  );

  const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags, exactEnvironment: environment });
  assert.equal(run.status, 0, run.stderr);

  const transcript = new RunTranscript(MAX_LINE_BYTES, () => undefined, () => undefined);
  transcript.push(Buffer.from(run.stdout));
  transcript.end();
  const decisions = parseGateDecisionLog(await readFile(decisionLogPath, 'utf8'));
  const verdict = decideOutcome({
    termination: 'exited',
    result: transcript.result,
    gateRequired: true,
    gate: { decisions, stopHookResponses: transcript.stopHookResponses },
    tamperedRunFiles: [],
  });
  return { run, decisions, stopHookBlocks: transcript.stopHookResponses.map((response) => response.blocked), verdict };
}

