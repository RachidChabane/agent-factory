import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { factoryFlags, runFakeClaude, runFakeClaudeAsync, type Completed } from './test-support/fake-claude-process.ts';
import { recordedPayloads, writeSettings } from './test-support/hook-fixtures.ts';
import { dig, digString } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { assistantTexts, linesOfShape, shapesOf } from './test-support/stream-shape.ts';

const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree. Issue 7.';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const THREE_ATTEMPTS = {
  entries: [
    {
      role: 'implementer',
      when: 'Issue 7',
      attempts: [
        { steps: [{ write: { path: 'out.txt', content: 'attempt 0' } }], final: 'zero' },
        { steps: [{ write: { path: 'out.txt', content: 'attempt 1' } }], final: 'one' },
        { steps: [{ write: { path: 'out.txt', content: 'attempt 2' } }], final: 'two' },
      ],
    },
    { role: 'implementer', when: 'Issue 8', attempts: [{ final: 'other entry' }] },
  ],
};

function sessionIdOf(run: Completed): string {
  return digString(run.lines[0], 'session_id');
}

describe('--resume', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
  });

  after(async () => {
    await sandbox.dispose();
  });

  beforeEach(async () => {
    await sandbox.writeScenario(THREE_ATTEMPTS);
  });

  function start(prompt = IMPLEMENTER_PROMPT, flags = factoryFlags(null)): Completed {
    const run = runFakeClaude(sandbox, { prompt, flags });
    assert.equal(run.status, 0, run.stderr);
    return run;
  }

  function resume(sessionId: string, prompt = 'The decision is: go ahead.', flags = factoryFlags(null)): Completed {
    const run = runFakeClaude(sandbox, { prompt, flags: [...flags, '--resume', sessionId] });
    assert.equal(run.status, 0, run.stderr);
    return run;
  }

  it('continues the session with the next unused attempt', async () => {
    const first = start();
    const sessionId = sessionIdOf(first);
    assert.match(sessionId, SESSION_ID);
    assert.deepEqual(assistantTexts(first.lines), ['zero']);

    const second = resume(sessionId);
    assert.equal(sessionIdOf(second), sessionId);
    assert.deepEqual(shapesOf(second.lines), ['init', 'rate-limit', 'tool-use:Write', 'tool-result', 'say', 'result']);
    assert.deepEqual(assistantTexts(second.lines), ['one']);
    assert.equal(await readFile(join(sandbox.worktree, 'out.txt'), 'utf8'), 'attempt 1');

    const third = resume(sessionId);
    assert.deepEqual(assistantTexts(third.lines), ['two']);
    assert.equal(await readFile(join(sandbox.worktree, 'out.txt'), 'utf8'), 'attempt 2');
    third.lines.forEach((line) => assert.equal(digString(line, 'session_id'), sessionId));
  });

  it('states the last final text again once every attempt has been used', () => {
    const sessionId = sessionIdOf(start());
    resume(sessionId);
    resume(sessionId);
    const exhausted = resume(sessionId);
    assert.deepEqual(shapesOf(exhausted.lines), ['init', 'rate-limit', 'say', 'result']);
    assert.deepEqual(assistantTexts(exhausted.lines), ['two']);
    assert.equal(digString(exhausted.lines.at(-1), 'result'), 'two');
  });

  it('keeps the entry the session started from, whatever the prompt of the resumed run says', () => {
    const sessionId = sessionIdOf(start());
    const resumed = resume(sessionId, 'Issue 8: please look at this other entry instead.');
    assert.deepEqual(assistantTexts(resumed.lines), ['one']);
  });

  it('accepts both --resume <id> and --resume=<id>', () => {
    const sessionId = sessionIdOf(start());
    const resumed = runFakeClaude(sandbox, { prompt: 'go on', flags: [...factoryFlags(null), `--resume=${sessionId}`] });
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.deepEqual(assistantTexts(resumed.lines), ['one']);
  });

  it('counts the attempts a blocked stop consumed inside the session', async () => {
    const blockOnce = await sandbox.writeScript('block-once.sh', `cat > /dev/null\n[ -e '${sandbox.path('blocked')}' ] || { touch '${sandbox.path('blocked')}'; echo 'not yet' >&2; exit 2; }`);
    const settings = await writeSettings(sandbox, { stop: [{ command: `sh '${blockOnce}'`, timeout: 20 }] });
    const first = start(IMPLEMENTER_PROMPT, factoryFlags(settings));
    assert.deepEqual(assistantTexts(first.lines), ['zero', 'one']);
    const resumed = resume(sessionIdOf(first), 'go on', factoryFlags(settings));
    assert.deepEqual(assistantTexts(resumed.lines), ['two']);
  });

  it('starts counting blocks again in every run, and reports the first Stop of a run as not active', async () => {
    const log = sandbox.path('resume-stop-payloads.jsonl');
    const alwaysBlock = await sandbox.writeScript('always-block.sh', `cat >> '${log}'\necho 'no' >&2\nexit 2`);
    const settings = await writeSettings(sandbox, { stop: [{ command: `sh '${alwaysBlock}'`, timeout: 20 }] });
    const flags = factoryFlags(settings);
    const first = start(IMPLEMENTER_PROMPT, flags);
    resume(sessionIdOf(first), 'again', flags);
    const payloads = recordedPayloads(log);
    assert.deepEqual(
      payloads.map((payload) => dig(payload, 'stop_hook_active')),
      [false, true, true, false, true, true],
    );
    assert.equal(linesOfShape(first.lines, 'feedback').length, 2);
  });

  it('never repeats a message or line identifier across the runs of a session', () => {
    const first = start();
    const sessionId = sessionIdOf(first);
    const lines = [...first.lines, ...resume(sessionId).lines, ...resume(sessionId).lines];
    for (const key of [['uuid'], ['message', 'id']]) {
      const identifiers = lines.flatMap((line) => {
        const found = dig(line, ...key);
        return typeof found === 'string' ? [found] : [];
      });
      assert.equal(new Set(identifiers).size, identifiers.length, `${key.join('.')} repeats`);
    }
  });

  it('records one more run in the session record every time', async () => {
    const sessionId = sessionIdOf(start());
    resume(sessionId);
    const record: unknown = JSON.parse(await readFile(join(sandbox.state, 'sessions', `${sessionId}.json`), 'utf8'));
    assert.deepEqual(record, { sessionId, script: { source: 'entry', index: 0 }, nextSlot: 2, runs: 2 });
  });

  it('reports a session it never started on standard error and exits with code 1', () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    const run = runFakeClaude(sandbox, { prompt: 'go on', flags: [...factoryFlags(null), '--resume', unknown] });
    assert.equal(run.status, 1);
    assert.equal(run.stderr, `fake-claude: No conversation found with session ID: ${unknown}\n`);
    assert.equal(run.stdout, '');
  });

  it('refuses a session identifier that could point outside the state directory', () => {
    const run = runFakeClaude(sandbox, { prompt: 'go on', flags: [...factoryFlags(null), '--resume', '../../etc/passwd'] });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /No conversation found with session ID: \.\.\/\.\.\/etc\/passwd/);
  });

  it('gives concurrent sessions of one state directory distinct identifiers', async () => {
    const CONCURRENT_RUNS = 4;
    const runs = await Promise.all(Array.from({ length: CONCURRENT_RUNS }, () => runFakeClaudeAsync(sandbox, { prompt: IMPLEMENTER_PROMPT })));
    runs.forEach((run) => assert.equal(run.status, 0, run.stderr));
    const identifiers = runs.map(sessionIdOf);
    assert.equal(new Set(identifiers).size, CONCURRENT_RUNS);
    const records = (await readdir(join(sandbox.state, 'sessions'))).filter((name) => identifiers.includes(name.replace(/\.json$/, '')));
    assert.equal(records.length, CONCURRENT_RUNS);
  });
});
