import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { STOP_HOOK_BLOCK_CAP_VARIABLE } from './cli/stop-hook-cap.ts';
import { factoryFlags, runFakeClaude, type Completed } from './test-support/fake-claude-process.ts';
import { recordedPayloads, writeSettings, type HookSpec } from './test-support/hook-fixtures.ts';
import { dig, digString } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { assistantTexts, linesOfShape, shapesOf } from './test-support/stream-shape.ts';

const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree.';
const STOP_RUN = ['hook-started:Stop', 'hook-response:Stop'];

interface Attempt {
  readonly steps?: readonly object[];
  readonly final?: string;
}

interface StopHookRun {
  readonly run: Completed;
  readonly payloads: readonly object[];
  readonly counterFile: string;
}

describe('Stop hooks', () => {
  let sandbox: Sandbox;
  let runNumber = 0;

  before(async () => {
    sandbox = await createSandbox();
  });

  after(async () => {
    await sandbox.dispose();
  });

  /** A Stop hook that blocks its first `blocks` runs, by JSON on standard output or by exit code 2, then lets the stop through. */
  async function countingHook(blocks: number, style: 'json' | 'exit-code'): Promise<{ spec: HookSpec; log: string; counter: string }> {
    runNumber += 1;
    const log = sandbox.path(`stop-payloads-${String(runNumber)}.jsonl`);
    const counter = sandbox.path(`stop-count-${String(runNumber)}.txt`);
    const script = await sandbox.writeScript(
      `stop-hook-${String(runNumber)}.sh`,
      [
        `cat >> '${log}'`,
        `runs=$(( $(cat '${counter}' 2>/dev/null || echo 0) + 1 ))`,
        `echo "$runs" > '${counter}'`,
        `if [ "$runs" -le ${String(blocks)} ]; then`,
        style === 'json'
          ? `  printf '{"decision":"block","reason":"attempt %s rejected"}' "$runs"`
          : `  echo "attempt $runs rejected" >&2; exit 2`,
        'fi',
      ].join('\n'),
    );
    return { spec: { command: `sh '${script}'`, timeout: 20 }, log, counter };
  }

  async function play(attempts: readonly Attempt[], hooks: readonly HookSpec[], environment: Record<string, string> = {}): Promise<Completed> {
    await sandbox.writeScenario({ entries: [{ role: 'implementer', when: 'acme', attempts }] });
    const settings = await writeSettings(sandbox, { stop: hooks });
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(settings), environment });
    assert.equal(run.status, 0, run.stderr);
    return run;
  }

  async function playCounting(attempts: readonly Attempt[], blocks: number, style: 'json' | 'exit-code', environment: Record<string, string> = {}): Promise<StopHookRun> {
    const hook = await countingHook(blocks, style);
    const run = await play(attempts, [hook.spec], environment);
    return { run, payloads: recordedPayloads(hook.log), counterFile: hook.counter };
  }

  const TWO_DRAFTS: readonly Attempt[] = [
    { steps: [{ write: { path: 'out.txt', content: 'v1' } }], final: 'first draft' },
    { steps: [{ write: { path: 'out.txt', content: 'v2' } }], final: 'second draft' },
  ];

  it('continues in the same session with the next attempt when the hook blocks, then ends when it lets the stop through', async () => {
    const { run, payloads } = await playCounting(TWO_DRAFTS, 1, 'json');

    assert.deepEqual(shapesOf(run.lines), [
      'init',
      'rate-limit',
      'tool-use:Write',
      'tool-result',
      'say',
      ...STOP_RUN,
      'feedback',
      'tool-use:Write',
      'tool-result',
      'say',
      ...STOP_RUN,
      'result',
    ]);
    assert.equal(await readFile(join(sandbox.worktree, 'out.txt'), 'utf8'), 'v2');
    assert.deepEqual(assistantTexts(run.lines), ['first draft', 'second draft']);
    const sessionIds = new Set(run.lines.map((line) => digString(line, 'session_id')));
    assert.equal(sessionIds.size, 1);

    const result = run.lines.at(-1);
    assert.equal(digString(result, 'result'), 'second draft');
    assert.equal(dig(result, 'num_turns'), 4);

    assert.deepEqual(
      payloads.map((payload) => [dig(payload, 'stop_hook_active'), dig(payload, 'last_assistant_message')]),
      [
        [false, 'first draft'],
        [true, 'second draft'],
      ],
    );
  });

  it('gives the hook the payload the CLI sends a Stop hook', async () => {
    const { run, payloads } = await playCounting(TWO_DRAFTS, 1, 'json');
    const sessionId = digString(run.lines[0], 'session_id');
    const [first, second] = payloads;
    assert.deepEqual(first, {
      session_id: sessionId,
      transcript_path: join(sandbox.state, 'transcripts', `${sessionId}.jsonl`),
      cwd: sandbox.worktree,
      permission_mode: 'dontAsk',
      effort: { level: 'low' },
      prompt_id: dig(first, 'prompt_id'),
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: 'first draft',
      background_tasks: [],
      session_crons: [],
    });
    assert.match(digString(first, 'prompt_id'), /^[0-9a-f-]{36}$/);
    assert.equal(dig(second, 'prompt_id'), dig(first, 'prompt_id'));
  });

  it('feeds the block reason back as a synthetic user turn, the way the CLI words it', async () => {
    const { run } = await playCounting(TWO_DRAFTS, 1, 'json');
    const [feedback] = linesOfShape(run.lines, 'feedback');
    const [started] = linesOfShape(run.lines, 'hook-started:Stop');
    assert.equal(dig(feedback, 'isSynthetic'), true);
    assert.equal(dig(feedback, 'parent_tool_use_id'), null);
    const command = digString(linesOfShape(run.lines, 'hook-response:Stop')[0], 'stdout');
    assert.equal(command, '{"decision":"block","reason":"attempt 1 rejected"}');
    assert.match(digString(feedback, 'message', 'content', 0, 'text'), /^Stop hook feedback:\n\[sh '.+stop-hook-\d+\.sh'\]: attempt 1 rejected\n$/);
    assert.equal(digString(started, 'hook_name'), 'Stop');
    assert.equal(digString(started, 'hook_event'), 'Stop');
  });

  it('reports every Stop hook execution with its output, exit code and outcome', async () => {
    const { run } = await playCounting(TWO_DRAFTS, 1, 'json');
    const responses = linesOfShape(run.lines, 'hook-response:Stop');
    const started = linesOfShape(run.lines, 'hook-started:Stop');
    assert.equal(responses.length, 2);
    responses.forEach((response, index) => assert.equal(digString(response, 'hook_id'), digString(started[index], 'hook_id')));
    assert.notEqual(digString(responses[0], 'hook_id'), digString(responses[1], 'hook_id'));
    assert.deepEqual(
      responses.map((response) => [dig(response, 'exit_code'), dig(response, 'outcome'), dig(response, 'stderr')]),
      [
        [0, 'success', ''],
        [0, 'success', ''],
      ],
    );
    assert.equal(digString(responses[0], 'output'), '{"decision":"block","reason":"attempt 1 rejected"}');
    assert.equal(digString(responses[1], 'output'), '');
  });

  it('treats exit code 2 as a block and takes the reason from standard error', async () => {
    const { run, payloads } = await playCounting(TWO_DRAFTS, 1, 'exit-code');
    const [first, second] = linesOfShape(run.lines, 'hook-response:Stop');
    assert.deepEqual([dig(first, 'exit_code'), dig(first, 'outcome'), dig(first, 'stderr'), dig(first, 'stdout')], [2, 'error', 'attempt 1 rejected\n', '']);
    assert.equal(digString(first, 'output'), 'attempt 1 rejected\n');
    assert.deepEqual([dig(second, 'exit_code'), dig(second, 'outcome')], [0, 'success']);
    assert.match(digString(linesOfShape(run.lines, 'feedback')[0], 'message', 'content', 0, 'text'), /\]: attempt 1 rejected\n$/);
    assert.equal(payloads.length, 2);
    assert.equal(await readFile(join(sandbox.worktree, 'out.txt'), 'utf8'), 'v2');
  });

  it('honours at most two blocks by default: the third block ends the session', async () => {
    const attempts: readonly Attempt[] = [0, 1, 2, 3].map((index) => ({
      steps: [{ write: { path: `attempt-${String(index)}.txt`, content: String(index) } }],
      final: `final ${String(index)}`,
    }));
    const { run, payloads } = await playCounting(attempts, 99, 'exit-code');

    assert.equal(payloads.length, 3);
    assert.deepEqual(payloads.map((payload) => dig(payload, 'stop_hook_active')), [false, true, true]);
    assert.equal(linesOfShape(run.lines, 'hook-response:Stop').length, 3);
    assert.equal(linesOfShape(run.lines, 'feedback').length, 2);
    assert.deepEqual(assistantTexts(run.lines), ['final 0', 'final 1', 'final 2']);
    await stat(join(sandbox.worktree, 'attempt-2.txt'));
    await assert.rejects(stat(join(sandbox.worktree, 'attempt-3.txt')), { code: 'ENOENT' });
    assert.equal(shapesOf(run.lines).at(-1), 'result');
    assert.equal(dig(run.lines.at(-1), 'subtype'), 'success');
    assert.equal(dig(run.lines.at(-1), 'is_error'), false);
  });

  const CAPS: readonly (readonly [string, number])[] = [
    ['0', 1],
    ['1', 2],
    ['3', 4],
    [' 1 ', 2],
    ['not a number', 3],
    ['-1', 3],
    ['', 3],
  ];

  for (const [configured, stopRuns] of CAPS) {
    it(`reads the block cap from ${STOP_HOOK_BLOCK_CAP_VARIABLE}=${JSON.stringify(configured)}, so the hook runs ${String(stopRuns)} time(s)`, async () => {
      const attempts: readonly Attempt[] = [0, 1, 2, 3, 4].map((index) => ({ final: `final ${String(index)}` }));
      const { run, payloads } = await playCounting(attempts, 99, 'json', { [STOP_HOOK_BLOCK_CAP_VARIABLE]: configured });
      assert.equal(payloads.length, stopRuns);
      assert.equal(linesOfShape(run.lines, 'feedback').length, stopRuns - 1);
      assert.equal(linesOfShape(run.lines, 'hook-response:Stop').length, stopRuns);
    });
  }

  it('states the last final text again when a block finds no attempt left', async () => {
    const { run } = await playCounting([{ steps: [{ write: { path: 'once.txt', content: '1' } }], final: 'all there is' }], 99, 'json');
    assert.deepEqual(assistantTexts(run.lines), ['all there is', 'all there is', 'all there is']);
    assert.equal(linesOfShape(run.lines, 'tool-use:Write').length, 1);
    assert.equal(digString(run.lines.at(-1), 'result'), 'all there is');
  });

  it('states the default closing text again when the last attempt has no final text', async () => {
    const { run } = await playCounting([{ steps: [{ say: 'working' }] }], 1, 'json');
    assert.deepEqual(assistantTexts(run.lines), ['working', 'Done.', 'Done.']);
  });

  it('runs every Stop hook and puts each objection in the feedback, in the order of the settings', async () => {
    const alpha = await countingHook(99, 'exit-code');
    const passing = await countingHook(0, 'json');
    const beta = await countingHook(99, 'json');
    const run = await play(TWO_DRAFTS, [alpha.spec, passing.spec, beta.spec]);
    assert.deepEqual(shapesOf(run.lines).slice(5, 14), [
      'hook-started:Stop',
      'hook-response:Stop',
      'hook-started:Stop',
      'hook-response:Stop',
      'hook-started:Stop',
      'hook-response:Stop',
      'feedback',
      'tool-use:Write',
      'tool-result',
    ]);
    const [feedback] = linesOfShape(run.lines, 'feedback');
    const text = digString(feedback, 'message', 'content', 0, 'text');
    const lines = text.trimEnd().split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'Stop hook feedback:');
    assert.match(lines[1] ?? '', /stop-hook-\d+\.sh'\]: attempt 1 rejected$/);
    assert.match(lines[2] ?? '', /stop-hook-\d+\.sh'\]: attempt 1 rejected$/);
    assert.notEqual(lines[1], lines[2]);
  });

  it('does not block on a Stop hook that outlives its timeout', async () => {
    const run = await play(TWO_DRAFTS, [{ command: 'exec sleep 30', timeout: 0.3 }]);
    const [response] = linesOfShape(run.lines, 'hook-response:Stop');
    assert.equal(dig(response, 'exit_code'), null);
    assert.equal(dig(response, 'outcome'), 'error');
    assert.equal(linesOfShape(run.lines, 'feedback').length, 0);
    assert.deepEqual(assistantTexts(run.lines), ['first draft']);
  });

  it('keeps its session record up to date after every attempt', async () => {
    const { run } = await playCounting(TWO_DRAFTS, 1, 'json');
    const sessionId = digString(run.lines[0], 'session_id');
    const record: unknown = JSON.parse(await readFile(join(sandbox.state, 'sessions', `${sessionId}.json`), 'utf8'));
    assert.deepEqual(record, { sessionId, script: { source: 'entry', index: 0 }, nextSlot: 2, runs: 1 });
  });
});
