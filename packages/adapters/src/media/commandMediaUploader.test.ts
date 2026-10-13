import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaUploadError, type CommandResult, type CommandRunner } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandSpawnError } from '../process/errors.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { CommandMediaUploader, NO_LINK_REASON } from './commandMediaUploader.ts';

const TIMEOUT_MS = 30_000;
const SHORT_TIMEOUT_MS = 600;
const LINK = 'https://files.example.test/a/film.mp4';

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return { exitCode: 0, stdout: `${LINK}\n`, stderr: '', durationMs: 5, timedOut: false, ...overrides };
}

class RecordingRunner implements CommandRunner {
  readonly calls: { command: readonly string[]; cwd: string; timeoutMs: number; env: Readonly<Record<string, string>> }[] = [];
  outcome: CommandResult | Error = result();

  run(command: readonly string[], cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    this.calls.push({ command, cwd, timeoutMs, env });
    return this.outcome instanceof Error ? Promise.reject(this.outcome) : Promise.resolve(this.outcome);
  }
}

describe('CommandMediaUploader with a runner that records the call', () => {
  const settings = { command: ['share', '--public', '{file}'], timeoutMs: 90_000, workingDirectory: '/factory', operatorEnvironment: { PATH: '/usr/bin', STORAGE_PROFILE: 'team', UNSET: undefined } };

  it('runs the command under nice, in the working directory, with the operator environment, and answers its link', async () => {
    const runner = new RecordingRunner();
    expect(await new CommandMediaUploader(runner, settings).upload('/cache/issue-7/film.mp4')).toBe(LINK);
    expect(runner.calls).toEqual([
      { command: ['nice', '-n', '10', 'share', '--public', '/cache/issue-7/film.mp4'], cwd: '/factory', timeoutMs: 90_000, env: { PATH: '/usr/bin', STORAGE_PROFILE: 'team' } },
    ]);
  });

  it('reads the link on the last non-empty line of what the command printed', async () => {
    const runner = new RecordingRunner();
    runner.outcome = result({ stdout: `Uploading 1 file\n100%\n${LINK}\n\n` });
    expect(await new CommandMediaUploader(runner, settings).upload('/cache/a.mp4')).toBe(LINK);
  });

  it('counts an upload as failed when the last line is not an address', async () => {
    const runner = new RecordingRunner();
    runner.outcome = result({ stdout: 'done\n' });
    await expect(new CommandMediaUploader(runner, settings).upload('/cache/a.mp4')).rejects.toThrow(NO_LINK_REASON);
  });

  it('names the exit code and what the command said when it failed', async () => {
    const runner = new RecordingRunner();
    runner.outcome = result({ exitCode: 2, stdout: '', stderr: '\u001b[31mError\u001b[0m: the storage quota is spent\n' });
    const upload = new CommandMediaUploader(runner, settings).upload('/cache/a.mp4');
    await expect(upload).rejects.toBeInstanceOf(MediaUploadError);
    await expect(upload).rejects.toThrow('the upload command exited with 2: Error: the storage quota is spent');
  });

  it('says that a command stopped on timeout did not finish in time', async () => {
    const runner = new RecordingRunner();
    runner.outcome = result({ timedOut: true, exitCode: 143 });
    await expect(new CommandMediaUploader(runner, settings).upload('/cache/a.mp4')).rejects.toThrow('the upload command did not finish within 90 seconds and was stopped');
  });

  it('says that a command which cannot start was not found', async () => {
    const runner = new RecordingRunner();
    runner.outcome = new CommandSpawnError(['nice', 'share'], new Error('spawn nice ENOENT'));
    await expect(new CommandMediaUploader(runner, settings).upload('/cache/a.mp4')).rejects.toThrow('the upload command could not be started');
  });
});

describe('CommandMediaUploader with a real command', () => {
  let tools = '';

  beforeEach(async () => {
    tools = await mkdtemp(join(tmpdir(), 'media-uploader-'));
  });
  afterEach(async () => {
    await rm(tools, { recursive: true, force: true });
  });

  async function script(body: string): Promise<string> {
    const path = join(tools, 'share');
    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
    return path;
  }

  function uploader(command: readonly string[], timeoutMs = TIMEOUT_MS): CommandMediaUploader {
    return new CommandMediaUploader(new SpawnCommandRunner({ killGraceMs: 100 }), {
      command,
      timeoutMs,
      workingDirectory: tools,
      operatorEnvironment: { PATH: process.env['PATH'], STORAGE_PROFILE: 'team-drive' },
    });
  }

  it('prints the file to the command and reads the link back, with the operator environment', async () => {
    const share = await script('echo "storing $1 for $STORAGE_PROFILE" >&2\necho "file://$1"');
    expect(await uploader([share, '{file}']).upload('/tmp/uploads/film.mp4')).toBe('file:///tmp/uploads/film.mp4');
  });

  it('runs the command in its working directory', async () => {
    const share = await script('echo "file://$(pwd)/seen"');
    expect(await uploader([share, '{file}']).upload('/tmp/x')).toBe(`file://${await realpath(tools)}/seen`);
  });

  it('reports a failing command with its exit code', async () => {
    const share = await script('echo "the account is locked" >&2\nexit 7');
    await expect(uploader([share, '{file}']).upload('/tmp/x')).rejects.toThrow('the upload command exited with 7: the account is locked');
  });

  it('stops a command that runs past its time limit', async () => {
    const share = await script('sleep 30');
    await expect(uploader([share, '{file}'], SHORT_TIMEOUT_MS).upload('/tmp/x')).rejects.toThrow('did not finish within 1 second and was stopped');
  });

  it('reports a command that does not exist', async () => {
    await expect(uploader([join(tools, 'missing'), '{file}']).upload('/tmp/x')).rejects.toBeInstanceOf(MediaUploadError);
  });
});
