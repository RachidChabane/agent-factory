import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { runFakeClaude, type Completed } from './test-support/fake-claude-process.ts';
import { dig, digString } from './test-support/json-navigation.ts';
import { createSandbox, type Sandbox } from './test-support/sandbox.ts';
import { assistantTexts, linesOfShape, shapesOf } from './test-support/stream-shape.ts';

const IMPLEMENTER_PROMPT = 'You implement one GitHub issue of acme/widgets in this working tree.';

function scenarioOf(steps: readonly object[], final?: string): object {
  return { entries: [{ role: 'implementer', when: 'acme/widgets', attempts: [{ steps, ...(final === undefined ? {} : { final }) }] }] };
}

describe('the steps of an attempt', () => {
  let sandbox: Sandbox;

  before(async () => {
    sandbox = await createSandbox();
  });

  after(async () => {
    await sandbox.dispose();
  });

  async function play(steps: readonly object[], final?: string): Promise<Completed> {
    await sandbox.writeScenario(scenarioOf(steps, final));
    const run = runFakeClaude(sandbox, { prompt: IMPLEMENTER_PROMPT });
    assert.equal(run.status, 0, run.stderr);
    return run;
  }

  it('announces a write like the CLI does, performs it, and confirms it', async () => {
    const run = await play([{ write: { path: 'src/deep/sum.ts', content: 'export const sum = 1;\n' } }], 'Added sum.');
    assert.deepEqual(shapesOf(run.lines), ['init', 'rate-limit', 'tool-use:Write', 'tool-result', 'say', 'result']);

    const absolute = join(sandbox.worktree, 'src', 'deep', 'sum.ts');
    const [announcement] = linesOfShape(run.lines, 'tool-use:Write');
    const block = dig(announcement, 'message', 'content', 0);
    assert.deepEqual(dig(block, 'input'), { file_path: absolute, content: 'export const sum = 1;\n' });
    assert.deepEqual(dig(block, 'caller'), { type: 'direct' });
    assert.equal(dig(announcement, 'parent_tool_use_id'), null);
    assert.equal(await readFile(absolute, 'utf8'), 'export const sum = 1;\n');

    const [confirmation] = linesOfShape(run.lines, 'tool-result');
    const result = dig(confirmation, 'message', 'content', 0);
    assert.equal(digString(result, 'tool_use_id'), digString(block, 'id'));
    assert.match(digString(result, 'content'), new RegExp(`^File created successfully at: ${absolute}`));
    assert.equal(dig(result, 'is_error'), undefined);
    assert.deepEqual(dig(confirmation, 'tool_use_result'), {
      type: 'create',
      filePath: absolute,
      content: 'export const sum = 1;\n',
      structuredPatch: [],
      originalFile: null,
      userModified: false,
    });
    assert.deepEqual(assistantTexts(run.lines), ['Added sum.']);
  });

  it('reports an update when the file already exists, and keeps the previous content in the report', async () => {
    await writeFile(join(sandbox.worktree, 'notes.txt'), 'before\n');
    const run = await play([{ write: { path: 'notes.txt', content: 'after\n' } }]);
    assert.equal(await readFile(join(sandbox.worktree, 'notes.txt'), 'utf8'), 'after\n');
    const [confirmation] = linesOfShape(run.lines, 'tool-result');
    assert.equal(dig(confirmation, 'tool_use_result', 'type'), 'update');
    assert.equal(dig(confirmation, 'tool_use_result', 'originalFile'), 'before\n');
  });

  it('writes an absolute file_path even when the scenario names a relative path, and creates every directory', async () => {
    await play([{ write: { path: './a/b/c/d.txt', content: '' } }]);
    assert.equal((await stat(join(sandbox.worktree, 'a', 'b', 'c', 'd.txt'))).size, 0);
  });

  it('announces a delete as a Bash call of rm -f and removes the file', async () => {
    await writeFile(join(sandbox.worktree, 'old.txt'), 'obsolete');
    const run = await play([{ delete: 'old.txt' }]);
    assert.deepEqual(shapesOf(run.lines), ['init', 'rate-limit', 'tool-use:Bash', 'tool-result', 'say', 'result']);
    const [announcement] = linesOfShape(run.lines, 'tool-use:Bash');
    assert.equal(dig(announcement, 'message', 'content', 0, 'input', 'command'), `rm -f ${join(sandbox.worktree, 'old.txt')}`);
    await assert.rejects(stat(join(sandbox.worktree, 'old.txt')), { code: 'ENOENT' });
  });

  it('quotes a path that a shell would split, and still deletes a file that does not exist', async () => {
    const run = await play([{ delete: "it's here/a file.txt" }]);
    const [announcement] = linesOfShape(run.lines, 'tool-use:Bash');
    const absolute = join(sandbox.worktree, "it's here", 'a file.txt');
    assert.equal(dig(announcement, 'message', 'content', 0, 'input', 'command'), `rm -f '${absolute.replaceAll("'", "'\\''")}'`);
    assert.deepEqual(shapesOf(run.lines).slice(2, 4), ['tool-use:Bash', 'tool-result']);
  });

  it('fails the tool result, not the run, when a delete targets a directory', async () => {
    await mkdir(join(sandbox.worktree, 'keep'));
    const run = await play([{ delete: 'keep' }]);
    assert.deepEqual(shapesOf(run.lines), ['init', 'rate-limit', 'tool-use:Bash', 'tool-error', 'say', 'result']);
    assert.equal((await stat(join(sandbox.worktree, 'keep'))).isDirectory(), true);
    const [failure] = linesOfShape(run.lines, 'tool-error');
    assert.equal(dig(failure, 'message', 'content', 0, 'is_error'), true);
  });

  it('fails the tool result when a write cannot be performed', async () => {
    await mkdir(join(sandbox.worktree, 'taken'));
    const run = await play([{ write: { path: 'taken', content: 'x' } }]);
    assert.deepEqual(shapesOf(run.lines), ['init', 'rate-limit', 'tool-use:Write', 'tool-error', 'say', 'result']);
    const [failure] = linesOfShape(run.lines, 'tool-error');
    assert.match(digString(failure, 'message', 'content', 0, 'content'), /EISDIR/);
  });

  it('plays the steps in order, a say step being one assistant text message', async () => {
    const run = await play(
      [{ say: 'First I read.' }, { write: { path: 'one.txt', content: '1' } }, { say: 'Then I wrote.' }, { delete: 'one.txt' }],
      'Finished.',
    );
    assert.deepEqual(shapesOf(run.lines), [
      'init',
      'rate-limit',
      'say',
      'tool-use:Write',
      'tool-result',
      'say',
      'tool-use:Bash',
      'tool-result',
      'say',
      'result',
    ]);
    assert.deepEqual(assistantTexts(run.lines), ['First I read.', 'Then I wrote.', 'Finished.']);
    await assert.rejects(stat(join(sandbox.worktree, 'one.txt')), { code: 'ENOENT' });
  });

  it('closes an attempt that has no final text with a default closing message', async () => {
    const run = await play([{ write: { path: 'x.txt', content: 'x' } }]);
    assert.deepEqual(assistantTexts(run.lines), ['Done.']);
    assert.equal(digString(run.lines.at(-1), 'result'), 'Done.');
  });
});
