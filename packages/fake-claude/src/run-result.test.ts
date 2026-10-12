import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { BASE_CONTEXT_TOKENS, FRESH_INPUT_TOKENS_PER_MESSAGE, costOf, tokensOf } from './metering/metering.ts';
import { factoryFlags, runFakeClaude, type Completed } from './test-support/fake-claude-process.ts';
import { dig, digList, digNumber, digString, type JsonObject } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { linesOfShape, shapeOf, shapesOf } from './test-support/stream-shape.ts';

const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_HOUR = 3_600;
const TIMING_TOLERANCE_SECONDS = 60;

const SCENARIO = {
  entries: [
    {
      role: 'implementer',
      when: 'acme',
      attempts: [
        {
          steps: [{ say: 'Looking at the code.' }, { write: { path: 'src/a.txt', content: 'alpha' } }, { delete: 'src/b.txt' }],
          final: 'All done.',
        },
      ],
    },
  ],
};

function assistantLines(run: Completed): readonly JsonObject[] {
  return run.lines.filter((line) => digString(line, 'type') === 'assistant');
}

function normalised(sandbox: Sandbox, run: Completed): string {
  return run.stdout.replaceAll(sandbox.root, '<root>').replace(/"resetsAt":\d+/g, '"resetsAt":0');
}

describe('the lines around a run', () => {
  let sandbox: Sandbox;
  let run: Completed;
  let startedAt: number;

  before(async () => {
    sandbox = await createSandbox();
    await sandbox.writeScenario(SCENARIO);
    startedAt = Date.now();
    run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT });
    assert.equal(run.status, 0, run.stderr);
  });

  after(async () => {
    await sandbox.dispose();
  });

  it('opens with the init line, followed by exactly one rate limit event', () => {
    assert.deepEqual(shapesOf(run.lines).slice(0, 2), ['init', 'rate-limit']);
    assert.equal(linesOfShape(run.lines, 'rate-limit').length, 1);
    assert.equal(shapeOf(run.lines.at(-1) ?? {}), 'result');
  });

  it('describes the session in the init line from the flags it was started with', () => {
    const init = run.lines[0];
    assert.equal(dig(init, 'type'), 'system');
    assert.equal(dig(init, 'subtype'), 'init');
    assert.match(digString(init, 'session_id'), UUID);
    assert.equal(digString(init, 'model'), 'haiku');
    assert.equal(digString(init, 'cwd'), sandbox.worktree);
    assert.deepEqual(digList(init, 'tools'), ['Read', 'Write', 'Bash']);
    assert.equal(digString(init, 'permissionMode'), 'dontAsk');
  });

  it('falls back to a default model, tool list and permission mode when the flags are absent', () => {
    const bare = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags: [] });
    assert.equal(bare.status, 0, bare.stderr);
    const init = bare.lines[0];
    assert.equal(digString(init, 'model'), 'fake-claude');
    assert.deepEqual(digList(init, 'tools'), ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write']);
    assert.equal(digString(init, 'permissionMode'), 'default');
  });

  it('reports the usage of the scenario as ratios and epoch seconds in the rate limit event', () => {
    const [event] = linesOfShape(run.lines, 'rate-limit');
    const now = Math.floor(startedAt / MILLISECONDS_PER_SECOND);
    const info = dig(event, 'rate_limit_info');
    assert.equal(dig(info, 'unifiedWindows', 'five_hour', 'utilization'), 0.12);
    assert.equal(dig(info, 'unifiedWindows', 'seven_day', 'utilization'), 0.34);
    const fiveHour = digNumber(info, 'unifiedWindows', 'five_hour', 'resetsAt');
    const sevenDay = digNumber(info, 'unifiedWindows', 'seven_day', 'resetsAt');
    assert.ok(Math.abs(fiveHour - (now + 3 * SECONDS_PER_HOUR)) <= TIMING_TOLERANCE_SECONDS);
    assert.ok(Math.abs(sevenDay - (now + 80 * SECONDS_PER_HOUR)) <= TIMING_TOLERANCE_SECONDS);
    assert.equal(Number.isInteger(fiveHour), true);
    assert.equal(digNumber(info, 'resetsAt'), fiveHour);
    assert.equal(digString(event, 'session_id'), digString(run.lines[0], 'session_id'));
  });

  it('takes the rate limit figures from a scenario that sets them', async () => {
    await sandbox.writeScenario({ ...SCENARIO, usage: { session: { percent: 99.5, resetsInHours: 0.25 }, weeklyAll: { percent: 0, resetsInHours: 1 } } });
    const custom = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT });
    const [event] = linesOfShape(custom.lines, 'rate-limit');
    assert.equal(dig(event, 'rate_limit_info', 'unifiedWindows', 'five_hour', 'utilization'), 0.995);
    assert.equal(dig(event, 'rate_limit_info', 'unifiedWindows', 'seven_day', 'utilization'), 0);
    await sandbox.writeScenario(SCENARIO);
  });

  it('finishes with a success result that carries the session, the last assistant text and the counts', () => {
    const result = run.lines.at(-1);
    assert.equal(dig(result, 'type'), 'result');
    assert.equal(dig(result, 'subtype'), 'success');
    assert.equal(dig(result, 'is_error'), false);
    assert.equal(digString(result, 'session_id'), digString(run.lines[0], 'session_id'));
    assert.equal(digString(result, 'result'), 'All done.');
    assert.equal(digNumber(result, 'num_turns'), 4);
    assert.ok(Number.isInteger(digNumber(result, 'duration_ms')) && digNumber(result, 'duration_ms') > 0);
    assert.ok(digNumber(result, 'duration_api_ms') <= digNumber(result, 'duration_ms'));
    assert.ok(digNumber(result, 'total_cost_usd') > 0);
    assert.deepEqual(dig(result, 'permission_denials'), []);
    assert.equal(dig(result, 'stop_reason'), 'end_turn');
  });

  it('gives every assistant message an identifier, a usage and no parent tool use', () => {
    const lines = assistantLines(run);
    assert.equal(lines.length, 4);
    for (const line of lines) {
      assert.match(digString(line, 'message', 'id'), /^msg_[0-9a-f]{24}$/);
      assert.equal(dig(line, 'parent_tool_use_id'), null);
      assert.equal(dig(line, 'message', 'role'), 'assistant');
      for (const counter of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
        assert.ok(digNumber(line, 'message', 'usage', counter) >= 0, counter);
      }
    }
    assert.equal(new Set(lines.map((line) => digString(line, 'message', 'id'))).size, lines.length);
  });

  it('pairs every tool use with a result that names it, and gives every line its own identifier', () => {
    const toolUses = run.lines.flatMap((line) => (dig(line, 'message', 'content', 0, 'type') === 'tool_use' ? [digString(line, 'message', 'content', 0, 'id')] : []));
    const answered = run.lines.flatMap((line) => (dig(line, 'message', 'content', 0, 'type') === 'tool_result' ? [digString(line, 'message', 'content', 0, 'tool_use_id')] : []));
    assert.equal(toolUses.length, 2);
    assert.deepEqual(answered, toolUses);
    toolUses.forEach((identifier) => assert.match(identifier, /^toolu_[0-9a-f]{24}$/));
    const uuids = run.lines.map((line) => digString(line, 'uuid'));
    assert.equal(new Set(uuids).size, uuids.length);
    uuids.forEach((uuid) => assert.match(uuid, UUID));
  });

  it('adds up the usage of its messages into the usage of the result, and prices it', () => {
    const counters = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const;
    const result = run.lines.at(-1);
    const turns = digNumber(result, 'num_turns');
    const distinctMessages = new Set(assistantLines(run).map((line) => digString(line, 'message', 'id')));
    assert.equal(distinctMessages.size, turns);
    for (const counter of counters) {
      const total = assistantLines(run).reduce((sum, line) => sum + digNumber(line, 'message', 'usage', counter), 0);
      assert.equal(digNumber(result, 'usage', counter), total, counter);
    }
    const usage = {
      inputTokens: digNumber(result, 'usage', 'input_tokens'),
      outputTokens: digNumber(result, 'usage', 'output_tokens'),
      cacheReadTokens: digNumber(result, 'usage', 'cache_read_input_tokens'),
      cacheCreationTokens: digNumber(result, 'usage', 'cache_creation_input_tokens'),
    };
    assert.equal(digNumber(result, 'total_cost_usd'), costOf(usage));
    assert.equal(usage.inputTokens, turns * FRESH_INPUT_TOKENS_PER_MESSAGE);
  });

  it('bills the prompt as the cache creation of the first message', () => {
    const [first] = assistantLines(run);
    assert.equal(digNumber(first, 'message', 'usage', 'cache_creation_input_tokens'), tokensOf(IMPLEMENTER_PROMPT.length));
    assert.equal(digNumber(first, 'message', 'usage', 'cache_read_input_tokens'), BASE_CONTEXT_TOKENS);
  });

  it('prints the same lines for the same work, whatever the state directory and the time', async () => {
    const other = await createSandbox();
    try {
      await other.writeScenario(SCENARIO);
      const again = runFakeClaude(other, { prompt: IMPLEMENTER_PROMPT });
      assert.equal(again.status, 0, again.stderr);
      assert.equal(normalised(other, again), normalised(sandbox, run));
    } finally {
      await other.dispose();
    }
  });

  it('writes every line it prints to the transcript the hooks are told about', async () => {
    const sessionId = digString(run.lines[0], 'session_id');
    const transcript = await readFile(join(sandbox.state, 'transcripts', `${sessionId}.jsonl`), 'utf8');
    assert.equal(transcript, run.stdout);
  });
});

describe('session identifiers', () => {
  it('derive from the session counter of the state directory', async () => {
    const first = await createSandbox();
    const second = await createSandbox();
    try {
      await first.writeScenario({});
      await second.writeScenario({});
      const a = runFakeClaude(first, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(null) });
      const b = runFakeClaude(second, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(null) });
      const a2 = runFakeClaude(first, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(null) });
      assert.equal(digString(a.lines[0], 'session_id'), digString(b.lines[0], 'session_id'));
      assert.notEqual(digString(a.lines[0], 'session_id'), digString(a2.lines[0], 'session_id'));
      assert.match(digString(a2.lines[0], 'session_id'), UUID);
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });
});
