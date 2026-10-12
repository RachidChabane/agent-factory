import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { TOOL_NAMES } from '@agent-factory/domain';
import { PINNED_CLAUDE_VERSION } from '../claude/claude-invocation.ts';
import { CommandSpawnError } from '../process/errors.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { CliToolProber, FIGMA_KEYCHAIN_SERVICE, type ToolProbeSettings } from './tool-probes.ts';

type Answer = Partial<CommandResult> | Error;

class AnsweringRunner implements CommandRunner {
  readonly asked: { readonly command: string; readonly timeoutMs: number; readonly env: Readonly<Record<string, string>> }[] = [];
  private readonly answers = new Map<string, Answer>();

  answer(command: string, answer: Answer): this {
    this.answers.set(command, answer);
    return this;
  }

  run(command: readonly string[], _cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    const key = command.join(' ');
    this.asked.push({ command: key, timeoutMs, env });
    const answer = this.answers.get(key);
    if (answer === undefined) return Promise.reject(new CommandSpawnError(command, Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', durationMs: 5, timedOut: false, ...answer });
  }
}

const SANDBOX_PROBE: readonly string[] = ['/usr/bin/sandbox-exec', '-p', '(version 1)', '/usr/bin/true'];

const SETTINGS: ToolProbeSettings = {
  environment: { PATH: '/usr/bin', VAULT_ADDR: 'https://vault.example.invalid' },
  ghEnvironment: { PATH: '/usr/bin', GH_PROMPT_DISABLED: '1' },
  claudeCommand: ['claude'],
  sandboxProbe: SANDBOX_PROBE,
  sandboxEnvironment: { PATH: '/usr/bin' },
  workingDirectory: '/home/operator/.agent-factory/worktrees',
  timeoutMs: 20_000,
};

function probe(runner: AnsweringRunner) {
  return new CliToolProber(runner, SETTINGS);
}

describe('tool probes', () => {
  it('reports a logged-in tool as connected with its version and no fix', async () => {
    const runner = new AnsweringRunner()
      .answer('gh auth status', { stdout: 'github.com\n  ✓ Logged in to github.com account operator (keyring)\n' })
      .answer('gh --version', { stdout: 'gh version 2.93.0 (2026-05-27)\n' });
    expect(await probe(runner).probe('gh')).toEqual({
      tool: 'gh',
      status: 'connected',
      version: '2.93.0',
      detail: '✓ Logged in to github.com account operator (keyring)',
      fixCommand: null,
    });
    expect(runner.asked[0]?.env).toBe(SETTINGS.ghEnvironment);
  });

  it('reports a missing login with the command that fixes it', async () => {
    const runner = new AnsweringRunner()
      .answer('tuc whoami', { exitCode: 1, stderr: 'ERROR no auth credentials found\n' })
      .answer('tuc version', { stdout: '\ntuc 3.46.0\n' });
    expect(await probe(runner).probe('tuc')).toEqual({
      tool: 'tuc',
      status: 'unauthenticated',
      version: '3.46.0',
      detail: 'ERROR no auth credentials found',
      fixCommand: 'tuc login',
    });
  });

  it('reads a probe that hangs on a browser login as a login needed, within its time bound', async () => {
    const runner = new AnsweringRunner().answer('pup auth status --no-agent', { exitCode: 143, timedOut: true }).answer('pup --version', { stdout: 'pup 1.6.6' });
    const result = await probe(runner).probe('pup');
    expect(result).toMatchObject({ status: 'unauthenticated', fixCommand: 'pup auth login', version: '1.6.6' });
    expect(result.detail).toContain('did not answer within 20 s');
    expect(runner.asked.every((entry) => entry.timeoutMs === SETTINGS.timeoutMs)).toBe(true);
  });

  it('reports a tool that is not installed as missing', async () => {
    expect(await probe(new AnsweringRunner()).probe('avn')).toMatchObject({ status: 'missing', version: null, fixCommand: null });
    expect(await probe(new AnsweringRunner()).probe('gcloud')).toMatchObject({ status: 'missing', fixCommand: 'brew install --cask google-cloud-sdk' });
  });

  it('reads the structured answers of gcloud, gws, vault and avn', async () => {
    const runner = new AnsweringRunner()
      .answer('gcloud auth list --format=json', { stdout: JSON.stringify([{ account: 'a@example.com', status: '' }, { account: 'b@example.com', status: 'ACTIVE' }]) })
      .answer('gws auth status', { stdout: 'Using keyring backend: keyring\n{"token_valid": false, "has_refresh_token": false}' })
      .answer('vault token lookup -format=json', { stdout: JSON.stringify({ data: { id: 'hvs.secret-value', display_name: 'oidc-operator', ttl: 3600 } }) })
      .answer('avn user info --json', { exitCode: 1, stderr: 'ERROR command failed: Expired db token, status 401' });
    const prober = probe(runner);
    expect(await prober.probe('gcloud')).toMatchObject({ status: 'connected', detail: 'b@example.com' });
    expect(await prober.probe('gws')).toMatchObject({ status: 'unauthenticated', fixCommand: 'gws auth login' });
    const vault = await prober.probe('vault');
    expect(vault).toMatchObject({ status: 'connected', detail: 'oidc-operator, 3600 s left' });
    expect(JSON.stringify(vault)).not.toContain('hvs.secret-value');
    expect(await prober.probe('avn')).toMatchObject({ status: 'unauthenticated', fixCommand: 'avn user login <email>' });
  });

  it('checks the figma token in the keychain without reading its value', async () => {
    const runner = new AnsweringRunner().answer(`/usr/bin/security find-generic-password -s ${FIGMA_KEYCHAIN_SERVICE}`, { exitCode: 44 });
    expect(await probe(runner).probe('figma')).toMatchObject({ status: 'unauthenticated' });
    expect(runner.asked.map((entry) => entry.command).join(' ')).not.toMatch(/ -w\b| -g\b/);
  });

  it('flags a claude that is not the pinned version and runs the sandbox probe profile', async () => {
    const runner = new AnsweringRunner()
      .answer('claude --version', { stdout: '9.9.9 (Claude Code)' })
      .answer(SANDBOX_PROBE.join(' '), { exitCode: 0 });
    expect(await probe(runner).probe('claude')).toMatchObject({ status: 'error', fixCommand: `claude install ${PINNED_CLAUDE_VERSION}` });
    expect(await probe(runner).probe('sandbox')).toMatchObject({ status: 'connected', fixCommand: null });
  });

  it('reports the sandbox probe as unavailable without a configuration', async () => {
    expect(await new CliToolProber(new AnsweringRunner(), { ...SETTINGS, sandboxProbe: null }).probe('sandbox')).toMatchObject({
      status: 'error',
      detail: 'skipped: the configuration did not load',
    });
  });

  it('answers for every tool the cockpit lists', async () => {
    const results = await Promise.all(TOOL_NAMES.map((tool) => probe(new AnsweringRunner()).probe(tool)));
    expect(results.map((result) => result.tool)).toEqual([...TOOL_NAMES]);
  });
});

describe('tool probes against real processes', () => {
  it('stops a probe that never answers at its time bound and reports the login it waits for', async () => {
    const prober = new CliToolProber(new SpawnCommandRunner({ killGraceMs: 100 }), {
      ...SETTINGS,
      environment: { PATH: '/usr/bin:/bin' },
      claudeCommand: ['/bin/sh', '-c', 'sleep 30'],
      workingDirectory: '/',
      timeoutMs: 300,
    });
    const started = Date.now();
    const result = await prober.probe('claude');
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result).toMatchObject({ status: 'unauthenticated', fixCommand: `claude install ${PINNED_CLAUDE_VERSION}` });
  });

  it('reports an executable absent from the PATH as missing', async () => {
    const prober = new CliToolProber(new SpawnCommandRunner(), { ...SETTINGS, environment: { PATH: '/nonexistent' }, workingDirectory: '/' });
    expect(await prober.probe('tuc')).toMatchObject({ status: 'missing' });
  });
});
