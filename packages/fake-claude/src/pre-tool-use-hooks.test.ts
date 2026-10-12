import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { factoryFlags, runFakeClaude, type Completed } from './test-support/fake-claude-process.ts';
import {
  ALLOW_DECISION,
  DENY_WRITE_DECISION,
  DENY_WRITE_OUTPUT,
  EXIT_TWO_DECISION,
  recordedPayloads,
  writeRecordingHook,
  writeSettings,
  type HookSpec,
} from './test-support/hook-fixtures.ts';
import { dig, digString } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { assistantTexts, linesOfShape, shapesOf } from './test-support/stream-shape.ts';

const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree.';
const WRITE_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';

describe('PreToolUse hooks', () => {
  let sandbox: Sandbox;
  let counter = 0;

  before(async () => {
    sandbox = await createSandbox();
  });

  after(async () => {
    await sandbox.dispose();
  });

  async function play(steps: readonly object[], hooks: readonly HookSpec[]): Promise<Completed> {
    await sandbox.writeScenario({ entries: [{ role: 'implementer', when: 'acme', attempts: [{ steps, final: 'Finished.' }] }] });
    const settings = await writeSettings(sandbox, { preToolUse: hooks });
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT, flags: factoryFlags(settings) });
    assert.equal(run.status, 0, run.stderr);
    return run;
  }

  async function recordingHook(decision: string, matcher: string | null = WRITE_MATCHER): Promise<{ spec: HookSpec; log: string }> {
    counter += 1;
    const log = sandbox.path(`payloads-${String(counter)}.jsonl`);
    const command = await writeRecordingHook(sandbox, `hook-${String(counter)}.sh`, log, decision);
    return { spec: { ...(matcher === null ? {} : { matcher }), command, timeout: 20 }, log };
  }

  it('denies a write when the hook answers with a deny decision, and writes nothing', async () => {
    const { spec } = await recordingHook(DENY_WRITE_DECISION);
    const run = await play([{ write: { path: 'frozen.txt', content: 'tampered' } }], [spec]);

    assert.deepEqual(shapesOf(run.lines), [
      'init',
      'rate-limit',
      'tool-use:Write',
      'hook-started:PreToolUse',
      'hook-response:PreToolUse',
      'denied',
      'tool-error',
      'say',
      'result',
    ]);
    await assert.rejects(stat(join(sandbox.worktree, 'frozen.txt')), { code: 'ENOENT' });

    const [announcement] = linesOfShape(run.lines, 'tool-use:Write');
    const toolUseId = digString(announcement, 'message', 'content', 0, 'id');
    const [denial] = linesOfShape(run.lines, 'denied');
    assert.equal(digString(denial, 'tool_name'), 'Write');
    assert.equal(digString(denial, 'tool_use_id'), toolUseId);
    assert.equal(digString(denial, 'message'), 'this path is frozen');
    assert.equal(digString(denial, 'session_id'), digString(run.lines[0], 'session_id'));

    const [refusal] = linesOfShape(run.lines, 'tool-error');
    assert.equal(digString(refusal, 'message', 'content', 0, 'tool_use_id'), toolUseId);
    assert.equal(digString(refusal, 'message', 'content', 0, 'content'), 'this path is frozen');
    assert.equal(dig(refusal, 'message', 'content', 0, 'is_error'), true);

    assert.deepEqual(dig(run.lines.at(-1), 'permission_denials'), [
      { tool_name: 'Write', tool_use_id: toolUseId, tool_input: { file_path: join(sandbox.worktree, 'frozen.txt'), content: 'tampered' } },
    ]);
  });

  it('reports the hook as the CLI does: a started line, then a response with its output and exit code', async () => {
    const { spec } = await recordingHook(DENY_WRITE_DECISION);
    const run = await play([{ write: { path: 'frozen.txt', content: 'x' } }], [spec]);
    const [started] = linesOfShape(run.lines, 'hook-started:PreToolUse');
    const [response] = linesOfShape(run.lines, 'hook-response:PreToolUse');
    assert.equal(digString(started, 'hook_name'), 'PreToolUse:Write');
    assert.equal(digString(response, 'hook_id'), digString(started, 'hook_id'));
    assert.equal(digString(response, 'hook_name'), 'PreToolUse:Write');
    assert.equal(dig(response, 'exit_code'), 0);
    assert.equal(dig(response, 'outcome'), 'success');
    assert.equal(digString(response, 'stdout'), DENY_WRITE_OUTPUT);
    assert.equal(digString(response, 'output'), DENY_WRITE_OUTPUT);
    assert.equal(dig(response, 'stderr'), '');
  });

  it('denies a write when the hook exits with code 2, giving standard error as the reason', async () => {
    const { spec } = await recordingHook(EXIT_TWO_DECISION);
    const run = await play([{ write: { path: 'frozen.txt', content: 'x' } }], [spec]);
    await assert.rejects(stat(join(sandbox.worktree, 'frozen.txt')), { code: 'ENOENT' });
    const [refusal] = linesOfShape(run.lines, 'tool-error');
    assert.equal(digString(refusal, 'message', 'content', 0, 'content'), 'stderr says no');
    const [response] = linesOfShape(run.lines, 'hook-response:PreToolUse');
    assert.equal(dig(response, 'exit_code'), 2);
    assert.equal(dig(response, 'outcome'), 'error');
    assert.equal(dig(response, 'stderr'), 'stderr says no\n');
  });

  it('performs the write when the hook lets it through, handing the hook the payload the CLI sends', async () => {
    const { spec, log } = await recordingHook(ALLOW_DECISION);
    const run = await play([{ write: { path: 'sub/ok.txt', content: 'fine' } }], [spec]);
    assert.deepEqual(shapesOf(run.lines), [
      'init',
      'rate-limit',
      'tool-use:Write',
      'hook-started:PreToolUse',
      'hook-response:PreToolUse',
      'tool-result',
      'say',
      'result',
    ]);
    assert.equal(await readFile(join(sandbox.worktree, 'sub', 'ok.txt'), 'utf8'), 'fine');

    const [payload] = recordedPayloads(log);
    const [announcement] = linesOfShape(run.lines, 'tool-use:Write');
    assert.deepEqual(payload, {
      session_id: digString(run.lines[0], 'session_id'),
      transcript_path: join(sandbox.state, 'transcripts', `${digString(run.lines[0], 'session_id')}.jsonl`),
      cwd: sandbox.worktree,
      permission_mode: 'dontAsk',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(sandbox.worktree, 'sub', 'ok.txt'), content: 'fine' },
      tool_use_id: digString(announcement, 'message', 'content', 0, 'id'),
    });
  });

  it('runs the hook in the working directory with the project directory in its environment', async () => {
    const log = sandbox.path('environment.txt');
    const command = `sh -c 'cat >/dev/null; pwd > "${log}"; echo "$CLAUDE_PROJECT_DIR" >> "${log}"'`;
    await play([{ write: { path: 'a.txt', content: 'a' } }], [{ matcher: 'Write', command }]);
    assert.equal(await readFile(log, 'utf8'), `${sandbox.worktree}\n${sandbox.worktree}\n`);
  });

  it('skips a hook whose matcher does not match the tool, and matches the whole tool name', async () => {
    const edit = await recordingHook(DENY_WRITE_DECISION, 'Edit');
    const partial = await recordingHook(DENY_WRITE_DECISION, 'Wri');
    const bashOnly = await recordingHook(DENY_WRITE_DECISION, 'Bash');
    const run = await play([{ write: { path: 'free.txt', content: 'x' } }], [edit.spec, partial.spec, bashOnly.spec]);
    assert.deepEqual(shapesOf(run.lines), ['init', 'rate-limit', 'tool-use:Write', 'tool-result', 'say', 'result']);
    assert.equal(await readFile(join(sandbox.worktree, 'free.txt'), 'utf8'), 'x');
  });

  it('also runs the hooks for the Bash call of a delete, and lets a hook deny it', async () => {
    await writeFile(join(sandbox.worktree, 'keep.txt'), 'precious');
    const everything = await recordingHook(DENY_WRITE_DECISION, null);
    const run = await play([{ delete: 'keep.txt' }], [everything.spec]);
    assert.deepEqual(shapesOf(run.lines).slice(2, 7), ['tool-use:Bash', 'hook-started:PreToolUse', 'hook-response:PreToolUse', 'denied', 'tool-error']);
    assert.equal(await readFile(join(sandbox.worktree, 'keep.txt'), 'utf8'), 'precious');
    const [payload] = recordedPayloads(everything.log);
    assert.equal(dig(payload, 'tool_name'), 'Bash');
    assert.equal(dig(payload, 'tool_input', 'command'), `rm -f ${join(sandbox.worktree, 'keep.txt')}`);
    const [started] = linesOfShape(run.lines, 'hook-started:PreToolUse');
    assert.equal(digString(started, 'hook_name'), 'PreToolUse:Bash');
  });

  it('matches every tool when the matcher is empty, a star or absent', async () => {
    const hooks = await Promise.all([recordingHook(ALLOW_DECISION, ''), recordingHook(ALLOW_DECISION, '*'), recordingHook(ALLOW_DECISION, null)]);
    const run = await play([{ write: { path: 'any.txt', content: 'x' } }], hooks.map(({ spec }) => spec));
    assert.equal(linesOfShape(run.lines, 'hook-response:PreToolUse').length, 3);
    hooks.forEach(({ log }) => assert.equal(recordedPayloads(log).length, 1));
  });

  it('runs every matching hook even after one denied, and denies when any of them does', async () => {
    const allowing = await recordingHook(ALLOW_DECISION);
    const denying = await recordingHook(DENY_WRITE_DECISION);
    const afterwards = await recordingHook(ALLOW_DECISION);
    const run = await play([{ write: { path: 'x.txt', content: 'x' } }], [allowing.spec, denying.spec, afterwards.spec]);
    assert.equal(linesOfShape(run.lines, 'hook-response:PreToolUse').length, 3);
    assert.equal(linesOfShape(run.lines, 'denied').length, 1);
    await assert.rejects(stat(join(sandbox.worktree, 'x.txt')), { code: 'ENOENT' });
  });

  it('refuses only the call a hook objects to and carries on with the following steps', async () => {
    const guard = await sandbox.writeScript('guard.sh', `case "$(cat)" in *frozen*) printf '%s' '${DENY_WRITE_OUTPUT}';; esac`);
    const run = await play(
      [{ write: { path: 'frozen/check.txt', content: 'x' } }, { write: { path: 'src/impl.txt', content: 'y' } }],
      [{ matcher: WRITE_MATCHER, command: `sh '${guard}'` }],
    );
    assert.equal(linesOfShape(run.lines, 'denied').length, 1);
    assert.equal(linesOfShape(run.lines, 'tool-result').length, 1);
    await assert.rejects(stat(join(sandbox.worktree, 'frozen', 'check.txt')), { code: 'ENOENT' });
    assert.equal(await readFile(join(sandbox.worktree, 'src', 'impl.txt'), 'utf8'), 'y');
    assert.deepEqual(assistantTexts(run.lines), ['Finished.']);
  });

  it('treats a hook that fails with another exit code as a non-blocking error', async () => {
    const run = await play([{ write: { path: 'still.txt', content: 'z' } }], [{ matcher: 'Write', command: 'echo trouble >&2; exit 1' }]);
    assert.equal(await readFile(join(sandbox.worktree, 'still.txt'), 'utf8'), 'z');
    const [response] = linesOfShape(run.lines, 'hook-response:PreToolUse');
    assert.equal(dig(response, 'exit_code'), 1);
    assert.equal(dig(response, 'outcome'), 'error');
  });

  it('kills a hook that outlives its timeout and lets the tool call go on', async () => {
    const run = await play([{ write: { path: 'late.txt', content: 'z' } }], [{ matcher: 'Write', command: 'exec sleep 30', timeout: 0.3 }]);
    assert.equal(await readFile(join(sandbox.worktree, 'late.txt'), 'utf8'), 'z');
    const [response] = linesOfShape(run.lines, 'hook-response:PreToolUse');
    assert.equal(dig(response, 'exit_code'), null);
    assert.equal(dig(response, 'outcome'), 'error');
  });

  it('does not wait for a background process that a hook leaves holding its output', async () => {
    const BACKGROUND_SECONDS = 5;
    const pidFile = sandbox.path('background.pid');
    const startedAt = Date.now();
    const run = await play(
      [{ write: { path: 'background.txt', content: 'x' } }],
      [{ matcher: 'Write', command: `sleep ${String(BACKGROUND_SECONDS)} & echo $! > '${pidFile}'; echo started`, timeout: 30 }],
    );
    const elapsedMs = Date.now() - startedAt;
    try {
      const [response] = linesOfShape(run.lines, 'hook-response:PreToolUse');
      assert.equal(dig(response, 'stdout'), 'started\n');
      assert.equal(dig(response, 'exit_code'), 0);
      assert.ok(elapsedMs < (BACKGROUND_SECONDS - 1) * 1_000, `the run took ${String(elapsedMs)} ms`);
    } finally {
      process.kill(Number((await readFile(pidFile, 'utf8')).trim()), 'SIGKILL');
    }
  });

  it('survives a hook that never reads its payload', async () => {
    const run = await play([{ write: { path: 'quick.txt', content: 'z'.repeat(2_000_000) } }], [{ matcher: 'Write', command: 'exit 0' }]);
    assert.equal(run.status, 0);
    assert.equal((await stat(join(sandbox.worktree, 'quick.txt'))).size, 2_000_000);
  });
});
