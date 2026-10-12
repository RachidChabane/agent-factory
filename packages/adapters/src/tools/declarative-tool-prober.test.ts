import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_TOOLS } from '@agent-factory/domain';
import { CommandSpawnError } from '../process/errors.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { DeclarativeToolProber, type DeclaredTool } from './declarative-tool-prober.ts';
import { InvalidToolDeclarationError } from './errors.ts';
import { CREDENTIAL_WITHHELD_DETAIL } from './tool-probe-engine.ts';
import { AnsweringRunner } from './testSupport.ts';

const ENVIRONMENT = { PATH: '/usr/bin', HOME: '/home/operator' };
const WORKING_DIRECTORY = '/home/operator/.agent-factory';
const TIMEOUT_MS = 20_000;
const GITHUB_TOKEN = `${['gh', 'p_'].join('')}${'A1b2C3d4E5'.repeat(4)}`;

const DEPLOY: DeclaredTool = {
  name: 'deploy',
  description: 'The deployment platform command line',
  check: ['deploy', 'whoami'],
  version: ['deploy', 'version'],
  connectedPattern: null,
  fix: 'deploy login',
  install: 'brew install deploy-cli',
  timeoutMs: TIMEOUT_MS,
};

const METRICS: DeclaredTool = {
  name: 'metrics',
  description: 'The monitoring command line',
  check: ['metrics', 'auth', 'status', '--no-agent'],
  version: ['metrics', '--version'],
  connectedPattern: null,
  fix: 'metrics auth login',
  install: null,
  timeoutMs: 2_000,
};

const CLOUD: DeclaredTool = {
  name: 'cloud',
  description: 'The cloud provider command line',
  check: ['cloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'],
  version: ['cloud', '--version'],
  connectedPattern: '\\S',
  fix: 'cloud auth login',
  install: 'brew install --cask cloud-sdk',
  timeoutMs: TIMEOUT_MS,
};

const WORKSPACE: DeclaredTool = {
  name: 'workspace',
  description: 'The office suite command line',
  check: ['workspace', 'auth', 'status'],
  version: null,
  connectedPattern: '"token_valid":\\s*true',
  fix: 'workspace auth login',
  install: null,
  timeoutMs: TIMEOUT_MS,
};

function prober(runner: AnsweringRunner, ...tools: readonly DeclaredTool[]): DeclarativeToolProber {
  return new DeclarativeToolProber(runner, { tools, environment: ENVIRONMENT, workingDirectory: WORKING_DIRECTORY });
}

describe('declared tool probes', () => {
  it('reports a tool whose check succeeds as connected, with the first line of its output and its version', async () => {
    const runner = new AnsweringRunner()
      .answer('deploy whoami', { stdout: '\n  operator@example.test (team platform)\nsecond line\n' })
      .answer('deploy version', { stdout: '\ndeploy 3.46.0\n' });
    expect(await prober(runner, DEPLOY).probe('deploy')).toEqual({
      tool: 'deploy',
      status: 'connected',
      version: '3.46.0',
      detail: 'operator@example.test (team platform)',
      fixCommand: null,
    });
  });

  it('runs the declared commands as they are written, with the environment it was given', async () => {
    const runner = new AnsweringRunner().answer('deploy whoami', { stdout: 'ok' }).answer('deploy version', { stdout: '1.2.3' });
    await prober(runner, DEPLOY).probe('deploy');
    expect(runner.asked.map((entry) => entry.command)).toEqual(['deploy whoami', 'deploy version']);
    expect(runner.asked.every((entry) => entry.env === ENVIRONMENT)).toBe(true);
  });

  it('reports a failing check as a login needed, with the command that fixes it', async () => {
    const runner = new AnsweringRunner()
      .answer('deploy whoami', { exitCode: 1, stderr: 'ERROR no auth credentials found\n' })
      .answer('deploy version', { stdout: '\ndeploy 3.46.0\n' });
    expect(await prober(runner, DEPLOY).probe('deploy')).toEqual({
      tool: 'deploy',
      status: 'unauthenticated',
      version: '3.46.0',
      detail: 'ERROR no auth credentials found',
      fixCommand: 'deploy login',
    });
  });

  it('names the exit code of a failing check that says nothing', async () => {
    const runner = new AnsweringRunner().answer('deploy whoami', { exitCode: 7 });
    expect(await prober(runner, DEPLOY).probe('deploy')).toMatchObject({ status: 'unauthenticated', detail: 'exit code 7' });
  });

  it('reads a check that hangs on a browser login as a login needed, within the time bound of the tool', async () => {
    const runner = new AnsweringRunner().answer('metrics auth status --no-agent', { exitCode: 143, timedOut: true }).answer('metrics --version', { stdout: 'metrics 1.6.6' });
    const result = await prober(runner, METRICS, DEPLOY).probe('metrics');
    expect(result).toMatchObject({ status: 'unauthenticated', fixCommand: 'metrics auth login', version: '1.6.6' });
    expect(result.detail).toBe('metrics auth status --no-agent did not answer within 2 s; it is probably waiting for a login');
    expect(runner.asked.map((entry) => entry.timeoutMs)).toEqual([2_000, 2_000]);
  });

  it('gives each tool its own time bound', async () => {
    const runner = new AnsweringRunner().answer('deploy whoami', { stdout: 'ok' }).answer('metrics auth status --no-agent', { stdout: 'ok' });
    const subject = prober(runner, DEPLOY, METRICS);
    await subject.probe('deploy');
    await subject.probe('metrics');
    expect(runner.asked.filter((entry) => entry.command.startsWith('deploy')).every((entry) => entry.timeoutMs === TIMEOUT_MS)).toBe(true);
    expect(runner.asked.filter((entry) => entry.command.startsWith('metrics')).every((entry) => entry.timeoutMs === 2_000)).toBe(true);
  });

  it('reports a tool that is not installed as missing, with the way to install it when the declaration has one', async () => {
    expect(await prober(new AnsweringRunner(), CLOUD).probe('cloud')).toMatchObject({
      status: 'missing',
      version: null,
      detail: 'cloud is not installed or not on the PATH',
      fixCommand: 'brew install --cask cloud-sdk',
    });
    expect(await prober(new AnsweringRunner(), METRICS).probe('metrics')).toMatchObject({ status: 'missing', fixCommand: null });
  });

  it('reports a tool that cannot start for another reason as an error', async () => {
    const runner = new AnsweringRunner().answer('deploy whoami', new CommandSpawnError(['deploy', 'whoami'], Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })));
    expect(await prober(runner, DEPLOY).probe('deploy')).toMatchObject({ status: 'error', version: null, fixCommand: null, detail: expect.stringContaining('EACCES') });
  });

  it('reads the connected pattern in the output of the check, on either stream', async () => {
    const runner = new AnsweringRunner()
      .answer('cloud auth list --filter=status:ACTIVE --format=value(account)', { stdout: 'b@example.test\n' })
      .answer('cloud --version', { stdout: 'Cloud SDK 4.2.0\n' })
      .answer('workspace auth status', { stderr: 'Using keyring backend: keyring\n{"token_valid": true, "has_refresh_token": false}' });
    const subject = prober(runner, CLOUD, WORKSPACE);
    expect(await subject.probe('cloud')).toMatchObject({ status: 'connected', detail: 'b@example.test', version: '4.2.0' });
    expect(await subject.probe('workspace')).toMatchObject({ status: 'connected', detail: 'Using keyring backend: keyring', version: null });
  });

  it('reads an output that does not match the connected pattern as a login needed, even when the check succeeds', async () => {
    const runner = new AnsweringRunner()
      .answer('cloud auth list --filter=status:ACTIVE --format=value(account)', { stdout: '\n' })
      .answer('workspace auth status', { stdout: 'Using keyring backend: keyring\n{"token_valid": false, "has_refresh_token": false}' });
    const subject = prober(runner, CLOUD, WORKSPACE);
    expect(await subject.probe('cloud')).toMatchObject({ status: 'unauthenticated', detail: 'the output does not match \\S', fixCommand: 'cloud auth login' });
    expect(await subject.probe('workspace')).toMatchObject({ status: 'unauthenticated', fixCommand: 'workspace auth login' });
  });

  it('classifies a probe as connected exactly when the check exits cleanly and its output matches', async () => {
    const outputs = fc.constantFrom('', 'ACTIVE', 'no active account', 'status: ACTIVE\nother', 'not ACTIVE');
    const patterns = fc.constantFrom(null, 'ACTIVE', '^ACTIVE', 'ACTIVE$', '\\S');
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 3 }), outputs, outputs, patterns, async (exitCode, stdout, stderr, pattern) => {
        const tool: DeclaredTool = { ...DEPLOY, connectedPattern: pattern };
        const runner = new AnsweringRunner().answer('deploy whoami', { exitCode, stdout, stderr });
        const result = await prober(runner, tool).probe('deploy');
        const matches = pattern === null || new RegExp(pattern).test(`${stdout}\n${stderr}`);
        expect(result.status).toBe(exitCode === 0 && matches ? 'connected' : 'unauthenticated');
        expect(result.fixCommand).toBe(result.status === 'connected' ? null : 'deploy login');
      }),
    );
  });

  it('shortens a long first line', async () => {
    const runner = new AnsweringRunner().answer('deploy whoami', { stdout: `${'x'.repeat(400)}\nnext` });
    const { detail } = await prober(runner, DEPLOY).probe('deploy');
    expect(detail).toBe(`${'x'.repeat(300)}…`);
  });

  it('says the check succeeded when it printed nothing', async () => {
    const runner = new AnsweringRunner().answer('deploy whoami', {});
    expect(await prober(runner, DEPLOY).probe('deploy')).toMatchObject({ status: 'connected', detail: 'the check succeeded', version: null });
  });

  it('withholds an output that looks like a credential, whichever way the check ends', async () => {
    const succeeding = new AnsweringRunner().answer('deploy whoami', { stdout: `token ${GITHUB_TOKEN}\n` });
    const failing = new AnsweringRunner().answer('deploy whoami', { exitCode: 1, stderr: `rejected ${GITHUB_TOKEN}\n` });
    for (const runner of [succeeding, failing]) {
      const result = await prober(runner, DEPLOY).probe('deploy');
      expect(result.detail).toBe(CREDENTIAL_WITHHELD_DETAIL);
      expect(JSON.stringify(result)).not.toContain(GITHUB_TOKEN);
    }
  });

  it('answers an error for a tool nobody declared, without running anything', async () => {
    const runner = new AnsweringRunner();
    expect(await prober(runner, DEPLOY).probe('pup')).toEqual({ tool: 'pup', status: 'error', version: null, detail: 'no tool named pup is configured', fixCommand: null });
    expect(runner.asked).toEqual([]);
  });

  it('answers for every tool it declares', async () => {
    const tools = [DEPLOY, METRICS, CLOUD, WORKSPACE];
    const results = await Promise.all(tools.map((tool) => prober(new AnsweringRunner(), ...tools).probe(tool.name)));
    expect(results.map((result) => result.tool)).toEqual(tools.map((tool) => tool.name));
  });
});

describe('declared tool validation', () => {
  it.each(BUILT_IN_TOOLS)('refuses a tool named like the built-in %s, which is probed by its own strategy', (name) => {
    expect(() => prober(new AnsweringRunner(), { ...DEPLOY, name })).toThrow(InvalidToolDeclarationError);
    expect(() => prober(new AnsweringRunner(), { ...DEPLOY, name })).toThrow(`The tool "${name}" cannot be probed: its name is reserved for a built-in tool`);
  });

  it('refuses a tool declared twice', () => {
    expect(() => prober(new AnsweringRunner(), DEPLOY, METRICS, { ...DEPLOY, check: ['deploy', 'status'] })).toThrow('The tool "deploy" cannot be probed: it is declared twice');
  });

  it('refuses a connected pattern that is not a regular expression, naming the tool and the pattern', () => {
    const invalid = { ...DEPLOY, connectedPattern: '(unclosed' };
    expect(() => prober(new AnsweringRunner(), invalid)).toThrow(InvalidToolDeclarationError);
    expect(() => prober(new AnsweringRunner(), invalid)).toThrow(/The tool "deploy" cannot be probed: connectedPattern "\(unclosed" is not a valid regular expression/);
  });

  it('refuses a check without a command, and a time bound that is not a positive number', () => {
    expect(() => prober(new AnsweringRunner(), { ...DEPLOY, check: [] })).toThrow('its check command is empty');
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => prober(new AnsweringRunner(), { ...DEPLOY, timeoutMs })).toThrow('its timeout must be a positive number of milliseconds');
    }
  });

  it('accepts no tool at all', async () => {
    expect(await prober(new AnsweringRunner()).probe('deploy')).toMatchObject({ status: 'error' });
  });
});

describe('declared tool probes against real processes', () => {
  const settings = { environment: { PATH: '/usr/bin:/bin' }, workingDirectory: '/' };

  function realProber(...tools: readonly DeclaredTool[]): DeclarativeToolProber {
    return new DeclarativeToolProber(new SpawnCommandRunner({ killGraceMs: 100 }), { ...settings, tools });
  }

  it('stops a check that never answers at the time bound of the tool and reports the login it waits for', async () => {
    const hanging: DeclaredTool = { ...DEPLOY, check: ['/bin/sh', '-c', 'sleep 30'], version: null, timeoutMs: 300 };
    const started = Date.now();
    const result = await realProber(hanging).probe('deploy');
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result).toMatchObject({ status: 'unauthenticated', fixCommand: 'deploy login' });
    expect(result.detail).toContain('probably waiting for a login');
  });

  it('reports an executable absent from the PATH as missing', async () => {
    expect(await realProber({ ...DEPLOY, check: ['definitely-not-installed-deploy-cli'] }).probe('deploy')).toMatchObject({
      status: 'missing',
      fixCommand: 'brew install deploy-cli',
    });
  });

  it('reads the output of a command that runs, against its pattern', async () => {
    const connected = { ...DEPLOY, check: ['/bin/sh', '-c', 'echo "logged in as operator"'], version: ['/bin/sh', '-c', 'echo "deploy 7.8.9"'], connectedPattern: 'logged in as \\w+' };
    expect(await realProber(connected).probe('deploy')).toMatchObject({ status: 'connected', detail: 'logged in as operator', version: '7.8.9' });
    const refused = { ...connected, check: ['/bin/sh', '-c', 'echo "not logged in" >&2; exit 3'] };
    expect(await realProber(refused).probe('deploy')).toMatchObject({ status: 'unauthenticated', detail: 'not logged in', fixCommand: 'deploy login' });
  });
});
