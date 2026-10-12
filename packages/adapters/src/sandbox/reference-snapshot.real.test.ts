import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { CommandSandbox } from '@agent-factory/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { git, TEST_GIT_ENVIRONMENT, testRunner } from '../git/testSupport.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { GitReferenceSnapshots } from '../references/gitReferenceSnapshots.ts';
import { BUBBLEWRAP_EXECUTABLE } from './bubblewrap-arguments.ts';
import { createCommandSandbox } from './command-sandbox-factory.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';

const TAG = 'v1.0.0';
const TOKENS = '{"space":4}\n';
const WROTE = 'wrote';
const REFUSED = 'refused';
const RUN_TIMEOUT_MS = 30_000;
const SETUP_TIMEOUT_MS = 60_000;
const KILL_GRACE_MS = 500;
const DARWIN = 'darwin';
const LINUX = 'linux';

function onPath(executable: string): boolean {
  return (process.env['PATH'] ?? '').split(delimiter).some((directory) => directory !== '' && existsSync(join(directory, executable)));
}

const CONFINEMENT_AVAILABLE =
  (process.platform === DARWIN && process.env['AGENT_FACTORY_REAL_SANDBOX'] === '1') || (process.platform === LINUX && onPath(BUBBLEWRAP_EXECUTABLE));

const WRITE_NEW_FILE = `if echo planted > "$1/planted.txt"; then echo ${WROTE}; else echo ${REFUSED}; fi 2>/dev/null`;
const READ_TOKENS = 'cat "$1/tokens.json" 2>/dev/null || true';

describe.skipIf(!CONFINEMENT_AVAILABLE)('reference snapshot grant', () => {
  const runner = new SpawnCommandRunner({ killGraceMs: KILL_GRACE_MS });
  const environment = { PATH: process.env['PATH'] ?? '' };
  let root: string;
  let worktree: string;
  let factoryDirectory: string;
  let referencesDirectory: string;
  let snapshot: string;

  function sandbox(change: Partial<CommandSandboxSettings>): CommandSandbox {
    return createCommandSandbox(process.platform, { deniedReads: [], writableDirectories: [], temporaryDirectories: [], blockedPorts: () => [], ...change });
  }

  async function confined(subject: CommandSandbox, script: string): Promise<string> {
    const command = ['/bin/sh', '-c', script, 'sh', snapshot, worktree];
    const result = await runner.run(subject.confine(command, { workingDirectory: worktree, network: false }), worktree, RUN_TIMEOUT_MS, environment);
    return result.stdout.trim();
  }

  async function unconfined(script: string): Promise<string> {
    const result = await runner.run(['/bin/sh', '-c', script, 'sh', snapshot, worktree], worktree, RUN_TIMEOUT_MS, environment);
    return result.stdout.trim();
  }

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'fr-')));
    worktree = join(root, 'worktree');
    factoryDirectory = join(root, 'factory');
    referencesDirectory = join(factoryDirectory, 'references');
    const source = join(root, 'design-tokens');
    await Promise.all([mkdir(worktree), mkdir(join(source, 'icons'), { recursive: true })]);
    git(root, 'init', '--initial-branch', 'main', source);
    await writeFile(join(source, 'tokens.json'), TOKENS);
    await writeFile(join(source, 'icons', 'dot.svg'), '<svg/>\n');
    git(source, 'add', '--all');
    git(source, 'commit', '--message', 'seed');
    git(source, 'tag', TAG);
    const snapshots = await GitReferenceSnapshots.open(testRunner(), { directory: referencesDirectory, environment: TEST_GIT_ENVIRONMENT });
    snapshot = (await snapshots.materialise({ name: 'design-tokens', repository: 'example-org/design-tokens', ref: TAG, source })).path;
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('answers an unconfined command that writes into the snapshot directory, so what is refused below is the sandbox', async () => {
    expect(await unconfined(WRITE_NEW_FILE)).toBe(WROTE);
    await rm(join(snapshot, 'planted.txt'));
  });

  it('lets a confined command read a file of the snapshot', async () => {
    expect(await confined(sandbox({ readOnlyDirectories: [snapshot] }), READ_TOKENS)).toBe(TOKENS.trim());
  });

  it('keeps the snapshot readable inside a directory whose reads are denied, and only the snapshot', async () => {
    await writeFile(join(referencesDirectory, 'other.txt'), 'not granted');
    const denied = { deniedReads: [{ path: referencesDirectory, prefix: false }] };

    expect(await confined(sandbox({ ...denied, readOnlyDirectories: [snapshot] }), READ_TOKENS)).toBe(TOKENS.trim());
    expect(await confined(sandbox({ ...denied, readOnlyDirectories: [snapshot] }), 'cat "$1/../other.txt" 2>/dev/null || true')).not.toContain('not granted');
    expect(await confined(sandbox(denied), READ_TOKENS)).toBe('');
  });

  it('refuses to create a file in the snapshot, though its directory allows its owner to', async () => {
    expect(await confined(sandbox({ readOnlyDirectories: [snapshot] }), WRITE_NEW_FILE)).toBe(REFUSED);
    expect(existsSync(join(snapshot, 'planted.txt'))).toBe(false);
  });

  it('refuses to create a file in the snapshot when a directory around it is writable, and to change one of its files', async () => {
    const subject = sandbox({ writableDirectories: [factoryDirectory], readOnlyDirectories: [snapshot] });

    expect(await confined(subject, WRITE_NEW_FILE)).toBe(REFUSED);
    expect(await confined(subject, `if rm -f "$1/tokens.json"; then echo ${WROTE}; else echo ${REFUSED}; fi 2>/dev/null; test -f "$1/tokens.json" && echo kept`)).toContain('kept');
    expect(existsSync(join(snapshot, 'planted.txt'))).toBe(false);
    expect(await readFile(join(snapshot, 'tokens.json'), 'utf8')).toBe(TOKENS);
  });

  it('would let a command write into the snapshot through a writable directory around it without the grant', async () => {
    expect(await confined(sandbox({ writableDirectories: [factoryDirectory] }), WRITE_NEW_FILE)).toBe(WROTE);
    await rm(join(snapshot, 'planted.txt'));
  });

  it('copies a directory of the snapshot into the worktree, and the copy can be removed again', async () => {
    const subject = sandbox({ readOnlyDirectories: [snapshot] });

    expect(await confined(subject, 'cp -R "$1/icons" "$2/" && cat "$2/icons/dot.svg"')).toBe('<svg/>');
    expect(await confined(subject, 'rm -rf "$2/icons"; test -e "$2/icons" && echo left || echo gone')).toBe('gone');
    expect(existsSync(join(worktree, 'icons'))).toBe(false);
  });
});
