import { execFileSync } from 'node:child_process';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidReferenceError, ReferenceRevisionNotFoundError, ReferenceSourceUnreadableError, type ReferenceSource } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { git, TEST_GIT_ENVIRONMENT, testRunner } from '../git/testSupport.ts';
import { GitReferenceSnapshots } from './gitReferenceSnapshots.ts';

const REAL_GIT_TEST_TIMEOUT_MS = 30_000;
const TAG = 'v1.0.0';
const BINARY_BYTES = Buffer.from([0, 255, 1, 254, 128, 10, 13, 0]);
const OWNER_WRITE_BITS = 0o200;
const EXECUTABLE_BITS = 0o111;

describe('GitReferenceSnapshots', { timeout: REAL_GIT_TEST_TIMEOUT_MS }, () => {
  let scratch: string;
  let source: string;
  let referencesDirectory: string;
  let reference: ReferenceSource;

  beforeEach(async () => {
    scratch = await realpath(await mkdtemp(join(tmpdir(), 'factory-reference-test-')));
    source = join(scratch, 'design-tokens');
    referencesDirectory = join(scratch, 'references');
    await mkdir(join(source, 'icons', 'small'), { recursive: true });
    git(scratch, 'init', '--initial-branch', 'main', source);
    await writeFile(join(source, 'icons', 'logo.png'), BINARY_BYTES);
    await writeFile(join(source, 'icons', 'small', 'dot.svg'), '<svg/>\n');
    await writeFile(join(source, 'tokens.json'), '{"space":4}\n');
    await writeFile(join(source, 'build.sh'), '#!/bin/sh\n', { mode: 0o755 });
    git(source, 'add', '--all');
    git(source, 'commit', '--message', 'seed');
    git(source, 'tag', TAG);
    reference = { name: 'design-tokens', repository: 'example-org/design-tokens', ref: TAG, source };
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  function open(): Promise<GitReferenceSnapshots> {
    return GitReferenceSnapshots.open(testRunner(), { directory: referencesDirectory, environment: TEST_GIT_ENVIRONMENT });
  }

  async function moveTag(content: string): Promise<void> {
    await writeFile(join(source, 'tokens.json'), content);
    git(source, 'commit', '--all', '--message', 'move the tag');
    git(source, 'tag', '--force', TAG);
  }

  it('extracts the files at the ref byte for byte, without git metadata, under <name>@<ref>', async () => {
    const snapshots = await open();
    const snapshot = await snapshots.materialise(reference);

    expect(snapshot.path).toBe(join(referencesDirectory, `design-tokens@${TAG}`));
    expect(snapshot.commit).toBe(git(source, 'rev-parse', `${TAG}^{commit}`));
    expect(snapshot.change).toBe('created');
    expect(await readFile(join(snapshot.path, 'icons', 'logo.png'))).toEqual(BINARY_BYTES);
    expect((await readdir(snapshot.path)).sort()).toEqual(['build.sh', 'icons', 'tokens.json']);
  });

  it('extracts the very bytes git stores for each file', async () => {
    const snapshot = await (await open()).materialise(reference);
    const stored = execFileSync('git', ['cat-file', 'blob', `${TAG}:icons/logo.png`], { cwd: source, env: TEST_GIT_ENVIRONMENT });
    expect(await readFile(join(snapshot.path, 'icons', 'logo.png'))).toEqual(stored);
  });

  it('makes every file read-only, keeps the executable bit, and leaves directories writable to their owner', async () => {
    const snapshot = await (await open()).materialise(reference);
    const logo = await lstat(join(snapshot.path, 'icons', 'logo.png'));
    const script = await lstat(join(snapshot.path, 'build.sh'));
    const nested = await lstat(join(snapshot.path, 'icons', 'small'));

    expect(logo.mode & OWNER_WRITE_BITS).toBe(0);
    expect(script.mode & OWNER_WRITE_BITS).toBe(0);
    expect(script.mode & EXECUTABLE_BITS).not.toBe(0);
    expect(nested.mode & OWNER_WRITE_BITS).not.toBe(0);
    await expect(writeFile(join(snapshot.path, 'tokens.json'), 'changed')).rejects.toThrow();
  });

  it('leaves a copy of a directory of the snapshot removable', async () => {
    const snapshot = await (await open()).materialise(reference);
    const copy = join(scratch, 'copy');

    await cp(join(snapshot.path, 'icons'), copy, { recursive: true });
    await rm(copy, { recursive: true });

    await expect(lstat(copy)).rejects.toThrow();
  });

  it('records the commit next to the snapshot, not inside it', async () => {
    const snapshots = await open();
    const snapshot = await snapshots.materialise(reference);

    expect(await readFile(`${snapshot.path}.commit`, 'utf8')).toBe(`${snapshot.commit}\n`);
    expect(await snapshots.inspect(reference)).toEqual({ path: snapshot.path, commit: snapshot.commit });
  });

  it('names the path of a snapshot before it is built, and holds nothing for it', async () => {
    const snapshots = await open();

    expect(snapshots.pathOf(reference)).toBe(join(referencesDirectory, `design-tokens@${TAG}`));
    expect(await snapshots.inspect(reference)).toEqual({ path: snapshots.pathOf(reference), commit: null });
  });

  it('holds the canonical path of its directory, whichever way it was named', async () => {
    const link = join(scratch, 'link');
    execFileSync('ln', ['-s', scratch, link]);
    const snapshots = await GitReferenceSnapshots.open(testRunner(), { directory: join(link, 'references'), environment: TEST_GIT_ENVIRONMENT });

    expect(snapshots.pathOf(reference)).toBe(join(scratch, 'references', `design-tokens@${TAG}`));
  });

  it('leaves a snapshot that already matches the ref untouched', async () => {
    const snapshots = await open();
    const first = await snapshots.materialise(reference);
    const before = await lstat(join(first.path, 'build.sh'));

    const second = await snapshots.materialise(reference);

    expect(second.change).toBe('unchanged');
    expect((await lstat(join(second.path, 'build.sh'))).ino).toBe(before.ino);
  });

  it('rebuilds the snapshot when the ref resolves to another commit, and leaves nothing beside it but its record', async () => {
    const snapshots = await open();
    const first = await snapshots.materialise(reference);
    await moveTag('{"space":8}\n');

    const second = await snapshots.materialise(reference);

    expect(second.change).toBe('rebuilt');
    expect(second.commit).not.toBe(first.commit);
    expect(second.commit).toBe(git(source, 'rev-parse', 'HEAD'));
    expect(await readFile(join(second.path, 'tokens.json'), 'utf8')).toBe('{"space":8}\n');
    expect(await readFile(`${second.path}.commit`, 'utf8')).toBe(`${second.commit}\n`);
    expect((await readdir(referencesDirectory)).sort()).toEqual([`design-tokens@${TAG}`, `design-tokens@${TAG}.commit`]);
  });

  it('builds a missing snapshot again when its commit record is missing', async () => {
    const snapshots = await open();
    const first = await snapshots.materialise(reference);
    await rm(`${first.path}.commit`);

    expect(await snapshots.inspect(reference)).toEqual({ path: first.path, commit: null });
    expect((await snapshots.materialise(reference)).change).toBe('created');
  });

  it('builds a missing snapshot again when its directory is gone but its record is not', async () => {
    const snapshots = await open();
    const first = await snapshots.materialise(reference);
    await rm(first.path, { recursive: true });

    expect(await snapshots.inspect(reference)).toEqual({ path: first.path, commit: null });
    expect((await snapshots.materialise(reference)).change).toBe('created');
  });

  it('ignores a commit record that does not hold a commit id', async () => {
    const snapshots = await open();
    const first = await snapshots.materialise(reference);
    await chmod(`${first.path}.commit`, 0o644);
    await writeFile(`${first.path}.commit`, 'not-a-commit\n');

    expect(await snapshots.inspect(reference)).toEqual({ path: first.path, commit: null });
  });

  it('resolves an annotated tag to the commit it points at', async () => {
    git(source, 'tag', '--annotate', '--message', 'annotated', 'annotated-v1');
    const snapshot = await (await open()).materialise({ ...reference, ref: 'annotated-v1' });
    expect(snapshot.commit).toBe(git(source, 'rev-parse', 'HEAD'));
  });

  it('accepts a full commit id as the ref', async () => {
    const commit = git(source, 'rev-parse', 'HEAD');
    const snapshot = await (await open()).materialise({ ...reference, ref: commit });
    expect(snapshot.path).toBe(join(referencesDirectory, `design-tokens@${commit}`));
    expect(snapshot.commit).toBe(commit);
  });

  it('resolves a ref to its commit without building anything, and says when the source holds none', async () => {
    const snapshots = await open();

    expect(await snapshots.resolve(reference)).toBe(git(source, 'rev-parse', 'HEAD'));
    expect(await snapshots.resolve({ ...reference, ref: 'v9.9.9' })).toBeNull();
    expect(await readdir(referencesDirectory)).toEqual([]);
  });

  it('fails with a fetch hint when the source has no such ref, and leaves nothing behind', async () => {
    const snapshots = await open();
    const failure = await snapshots.materialise({ ...reference, ref: 'v9.9.9' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ReferenceRevisionNotFoundError);
    expect(String(failure)).toContain(`git -C ${source} fetch --tags`);
    expect(await readdir(referencesDirectory)).toEqual([]);
  });

  it('fails clearly when the source is not a git clone', async () => {
    const plain = join(scratch, 'plain');
    await mkdir(plain);
    const snapshots = await open();

    await expect(snapshots.materialise({ ...reference, source: plain })).rejects.toBeInstanceOf(ReferenceSourceUnreadableError);
    await expect(snapshots.materialise({ ...reference, source: join(scratch, 'absent') })).rejects.toBeInstanceOf(ReferenceSourceUnreadableError);
    await expect(snapshots.resolve({ ...reference, source: plain })).rejects.toBeInstanceOf(ReferenceSourceUnreadableError);
  });

  it('keeps the previous snapshot readable when a rebuild fails', async () => {
    const snapshots = await open();
    const first = await snapshots.materialise(reference);
    await moveTag('{"space":8}\n');
    git(source, 'tag', '--delete', TAG);

    await expect(snapshots.materialise(reference)).rejects.toBeInstanceOf(ReferenceRevisionNotFoundError);
    expect(await snapshots.inspect(reference)).toEqual({ path: first.path, commit: first.commit });
    expect(await readFile(join(first.path, 'tokens.json'), 'utf8')).toBe('{"space":4}\n');
  });

  it('refuses a name or a ref that could leave its directory or pass for an option', async () => {
    const snapshots = await open();

    await expect(snapshots.materialise({ ...reference, name: '../escape' })).rejects.toBeInstanceOf(InvalidReferenceError);
    await expect(snapshots.materialise({ ...reference, ref: '--output=/tmp/x' })).rejects.toBeInstanceOf(InvalidReferenceError);
    expect(() => snapshots.pathOf({ ...reference, ref: '../x' })).toThrow(InvalidReferenceError);
    await expect(snapshots.resolve({ ...reference, ref: '-rf' })).rejects.toBeInstanceOf(InvalidReferenceError);
    expect(await readdir(referencesDirectory)).toEqual([]);
  });

  it('serialises the materialisations of one reference asked at once', async () => {
    const snapshots = await open();

    const outcomes = await Promise.all([snapshots.materialise(reference), snapshots.materialise(reference), snapshots.materialise(reference)]);

    expect(outcomes.map((outcome) => outcome.change)).toEqual(['created', 'unchanged', 'unchanged']);
    expect((await readdir(referencesDirectory)).sort()).toEqual([`design-tokens@${TAG}`, `design-tokens@${TAG}.commit`]);
  });
});
