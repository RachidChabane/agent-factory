import { describe, expect, it } from 'vitest';
import { BUILT_IN_TOOLS } from '@agent-factory/domain';
import { PINNED_CLAUDE_VERSION } from '../claude/claude-invocation.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { CliToolProber, NO_PROBE_WITHOUT_CONFIGURATION, type ToolProbeSettings } from './tool-probes.ts';
import { AnsweringRunner } from './testSupport.ts';

const SANDBOX_PROBE: readonly string[] = ['/usr/bin/sandbox-exec', '-p', '(version 1)', '/usr/bin/true'];

const SETTINGS: ToolProbeSettings = {
  environment: { PATH: '/usr/bin', LANG: 'C.UTF-8' },
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

describe('built-in tool probes', () => {
  it('reports a logged-in gh as connected with its version and no fix', async () => {
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

  it('reports a missing gh login with the command that fixes it', async () => {
    const runner = new AnsweringRunner()
      .answer('gh auth status', { exitCode: 1, stderr: 'You are not logged into any GitHub hosts. To log in, run: gh auth login\n' })
      .answer('gh --version', { stdout: 'gh version 2.93.0 (2026-05-27)\n' });
    expect(await probe(runner).probe('gh')).toEqual({
      tool: 'gh',
      status: 'unauthenticated',
      version: '2.93.0',
      detail: 'You are not logged into any GitHub hosts. To log in, run: gh auth login',
      fixCommand: 'gh auth login',
    });
  });

  it('reads a gh that hangs on a browser login as a login needed, within its time bound', async () => {
    const runner = new AnsweringRunner().answer('gh auth status', { exitCode: 143, timedOut: true }).answer('gh --version', { stdout: 'gh version 2.93.0' });
    const result = await probe(runner).probe('gh');
    expect(result).toMatchObject({ status: 'unauthenticated', fixCommand: 'gh auth login', version: '2.93.0' });
    expect(result.detail).toContain('did not answer within 20 s');
    expect(result.detail).toContain('probably waiting for a login');
    expect(runner.asked.every((entry) => entry.timeoutMs === SETTINGS.timeoutMs)).toBe(true);
  });

  it('reports a gh that is not installed as missing, with the way to install it', async () => {
    expect(await probe(new AnsweringRunner()).probe('gh')).toMatchObject({ status: 'missing', version: null, fixCommand: 'brew install gh' });
  });

  it('reports git as connected with its version', async () => {
    const runner = new AnsweringRunner().answer('git --version', { stdout: 'git version 2.50.1\n' });
    expect(await probe(runner).probe('git')).toEqual({ tool: 'git', status: 'connected', version: '2.50.1', detail: 'git version 2.50.1', fixCommand: null });
    expect(runner.asked.every((entry) => entry.env === SETTINGS.environment)).toBe(true);
  });

  it('reports git as missing when it is not on the PATH, and as an error when it fails', async () => {
    expect(await probe(new AnsweringRunner()).probe('git')).toMatchObject({ status: 'missing', version: null, fixCommand: null });
    const broken = new AnsweringRunner().answer('git --version', { exitCode: 134, stderr: 'dyld: Library not loaded: libpcre2.dylib\n' });
    expect(await probe(broken).probe('git')).toMatchObject({ status: 'error', fixCommand: null, detail: 'dyld: Library not loaded: libpcre2.dylib' });
  });

  it('flags a claude that is not the pinned version, and accepts the pinned one', async () => {
    const other = new AnsweringRunner().answer('claude --version', { stdout: '9.9.9 (Claude Code)' });
    expect(await probe(other).probe('claude')).toMatchObject({ status: 'error', fixCommand: `claude install ${PINNED_CLAUDE_VERSION}` });
    const pinned = new AnsweringRunner().answer('claude --version', { stdout: `${PINNED_CLAUDE_VERSION} (Claude Code)` });
    expect(await probe(pinned).probe('claude')).toMatchObject({ status: 'connected', fixCommand: null });
  });

  it('runs the probe command of the command sandbox and describes it without naming a platform tool', async () => {
    const runner = new AnsweringRunner().answer(SANDBOX_PROBE.join(' '), { exitCode: 0 });
    const result = await probe(runner).probe('sandbox');
    expect(result).toMatchObject({ status: 'connected', fixCommand: null });
    expect(runner.asked[0]?.env).toBe(SETTINGS.sandboxEnvironment);
    expect(result.detail).not.toContain('sandbox-exec');
  });

  it('reports a sandbox that refuses its probe as an error carrying the refusal', async () => {
    const runner = new AnsweringRunner().answer(SANDBOX_PROBE.join(' '), { exitCode: 1, stderr: 'bwrap: Creating new namespace failed: Operation not permitted\n' });
    expect(await probe(runner).probe('sandbox')).toMatchObject({
      status: 'error',
      detail: 'the command sandbox refused to run the probe: bwrap: Creating new namespace failed: Operation not permitted',
    });
  });

  it('reports the sandbox probe as unavailable without a configuration', async () => {
    const runner = new AnsweringRunner();
    expect(await new CliToolProber(runner, { ...SETTINGS, sandboxProbe: null }).probe('sandbox')).toMatchObject({
      status: 'error',
      detail: NO_PROBE_WITHOUT_CONFIGURATION,
    });
    expect(runner.asked).toEqual([]);
  });

  it('answers an error, without running anything, for a tool it has no built-in probe for', async () => {
    const runner = new AnsweringRunner();
    expect(await probe(runner).probe('pup')).toEqual({ tool: 'pup', status: 'error', version: null, detail: 'pup is not a built-in tool', fixCommand: null });
    expect(runner.asked).toEqual([]);
  });

  it('answers for every built-in tool', async () => {
    const results = await Promise.all(BUILT_IN_TOOLS.map((tool) => probe(new AnsweringRunner()).probe(tool)));
    expect(results.map((result) => result.tool)).toEqual([...BUILT_IN_TOOLS]);
  });
});

describe('built-in tool probes against real processes', () => {
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
    expect(await prober.probe('git')).toMatchObject({ status: 'missing' });
  });
});
