import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeWorkspaceFiles, SpawnCommandRunner } from '@agent-factory/adapters';
import { ShellCommands, StructuredAcceptance, type AcceptanceManifest, type CommandSandbox } from '@agent-factory/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN_TIMEOUT_MS = 60_000;
const UNCONFINED: CommandSandbox = { confine: (command) => command };
const FAILING_CHECK = `import { test } from 'node:test';
import assert from 'node:assert/strict';
test('criterion 1: the badge shows the item count', () => {
  assert.equal(null, '2 items');
});
`;

function manifest(command: readonly string[]): AcceptanceManifest {
  return {
    runner: 'node-test',
    checks: [{ criterion: 1, paths: ['test/acceptance/badge.test.js'], description: 'the badge shows the item count', onBase: 'fails' }],
    command: [...command],
    evidence: [],
    score: null,
  };
}

describe('the acceptance checks of a node:test project', () => {
  let worktree: string;

  beforeAll(async () => {
    worktree = await mkdtemp(join(tmpdir(), 'factory-node-test-'));
    await mkdir(join(worktree, 'test', 'acceptance'), { recursive: true });
    await writeFile(join(worktree, 'package.json'), JSON.stringify({ name: 'storefront', type: 'module' }));
    await writeFile(join(worktree, 'test', 'acceptance', 'badge.test.js'), FAILING_CHECK);
  });

  afterAll(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it('reads the report node writes into the report directory, which the factory empties before every run', async () => {
    const shell = new ShellCommands(new SpawnCommandRunner(), UNCONFINED, { PATH: process.env['PATH'] ?? '' }, RUN_TIMEOUT_MS, null);
    const acceptance = new StructuredAcceptance(shell, new NodeWorkspaceFiles());
    const command = [process.execPath, '--test', 'test/acceptance/badge.test.js'];
    for (const attempt of [1, 2]) {
      const run = await acceptance.run({ path: worktree, branch: 'factory/12-badge', baseSha: 'base' }, manifest(command), 'node-test');
      expect(run?.reportProblem, `attempt ${attempt}`).toBeNull();
      expect(run?.report?.cases.map((result) => [result.file, result.outcome, result.failureKind]), `attempt ${attempt}`).toEqual([['test/acceptance/badge.test.js', 'failed', 'assertion']]);
    }
  });
});
