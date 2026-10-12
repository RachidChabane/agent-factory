import { mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedFiles, createRunWorkspace, resolveIsolationLayout, writeRunJson } from './run-workspace.ts';

const PRIVATE_DIRECTORY_PERMISSIONS = 0o700;
const PERMISSION_BITS = 0o777;

describe('run workspace', () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'run-workspace-')));
    await mkdir(join(root, 'worktree'));
    await mkdir(join(root, 'factory'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves symbolic links so deny rules match the real paths', async () => {
    await symlink(join(root, 'worktree'), join(root, 'worktree-link'));
    const layout = await resolveIsolationLayout(join(root, 'worktree-link'), join(root, 'runs'), join(root, 'factory'));
    expect(layout).toEqual({
      worktree: join(root, 'worktree'),
      runsRoot: join(root, 'runs'),
      protectedDirectories: [join(root, 'runs'), join(root, 'factory')],
      writableDirectories: [],
    });
  });

  it('creates the writable tool directories and keeps them apart from the protected ones', async () => {
    const layout = await resolveIsolationLayout(join(root, 'worktree'), join(root, 'runs'), join(root, 'factory'), [], [join(root, 'cache', 'uv')]);
    expect(layout.writableDirectories).toEqual([join(root, 'cache', 'uv')]);
    expect((await stat(join(root, 'cache', 'uv'))).isDirectory()).toBe(true);
    await expect(
      resolveIsolationLayout(join(root, 'worktree'), join(root, 'runs'), join(root, 'factory'), [], [join(root, 'runs', 'cache')]),
    ).rejects.toThrow(/writable directory .* must not contain each other/);
  });

  it('protects the additional directories it is given', async () => {
    await mkdir(join(root, 'github'));
    const layout = await resolveIsolationLayout(join(root, 'worktree'), join(root, 'runs'), join(root, 'factory'), [join(root, 'github')]);
    expect(layout.protectedDirectories).toEqual([join(root, 'runs'), join(root, 'factory'), join(root, 'github')]);
    await expect(
      resolveIsolationLayout(join(root, 'worktree'), join(root, 'runs'), join(root, 'factory'), [root]),
    ).rejects.toThrow(/must not contain each other/);
  });

  it('refuses a runs directory inside the worktree', async () => {
    await expect(
      resolveIsolationLayout(join(root, 'worktree'), join(root, 'worktree', 'runs'), join(root, 'factory')),
    ).rejects.toThrow(/must not contain each other/);
  });

  it('refuses a worktree inside the factory installation', async () => {
    await mkdir(join(root, 'factory', 'worktree'));
    await expect(
      resolveIsolationLayout(join(root, 'factory', 'worktree'), join(root, 'runs'), join(root, 'factory')),
    ).rejects.toThrow(/must not contain each other/);
  });

  it('creates a private directory per run with an empty gh configuration directory', async () => {
    const workspace = await createRunWorkspace(root, 'run-1');
    expect((await stat(workspace.directory)).mode & PERMISSION_BITS).toBe(PRIVATE_DIRECTORY_PERMISSIONS);
    expect((await stat(workspace.githubConfigDirectory)).isDirectory()).toBe(true);
  });

  it('refuses run identifiers that would escape the runs directory', async () => {
    await expect(createRunWorkspace(root, '../escape')).rejects.toThrow(/not a safe directory name/);
    await expect(createRunWorkspace(root, '')).rejects.toThrow(/not a safe directory name/);
  });

  it('refuses to reuse the directory of an earlier run', async () => {
    await createRunWorkspace(root, 'run-1');
    await expect(createRunWorkspace(root, 'run-1')).rejects.toThrow(/EEXIST/);
  });

  it('detects run files changed after they were written', async () => {
    const workspace = await createRunWorkspace(root, 'run-1');
    const fingerprint = await writeRunJson(workspace.settingsPath, { hooks: {} });
    expect(await changedFiles([fingerprint])).toEqual([]);
    await writeFile(workspace.settingsPath, '{}');
    expect(await changedFiles([fingerprint])).toEqual([workspace.settingsPath]);
    await rm(workspace.settingsPath);
    expect(await changedFiles([fingerprint])).toEqual([workspace.settingsPath]);
  });
});
