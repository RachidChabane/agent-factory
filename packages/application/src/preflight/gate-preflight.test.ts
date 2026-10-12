import { describe, expect, it } from 'vitest';
import type { BaseCheckout, BaseCheckouts } from '../ports.ts';
import { ShellCommands } from '../pipeline/shell-commands.ts';
import { RecordingSandbox, ScriptedCommandRunner } from '../pipeline/testing/pipeline-fakes.ts';
import { dryFormOf } from './dry-forms.ts';
import { GatePreflight, PREFLIGHT_WORKSPACE_NAME, type GatePreflightSettings } from './gate-preflight.ts';

class RecordingWorkspaces implements BaseCheckouts {
  readonly opened: string[] = [];
  readonly removed: string[] = [];
  failure: Error | null = null;

  checkout(name: string): Promise<BaseCheckout> {
    if (this.failure !== null) return Promise.reject(this.failure);
    this.opened.push(name);
    return Promise.resolve({ path: `/pool/base-workspaces/${name}`, sha: 'base' });
  }

  remove(checkout: BaseCheckout): Promise<void> {
    this.removed.push(checkout.path);
    return Promise.resolve();
  }
}

const SETTINGS: GatePreflightSettings = {
  setupCommands: [{ name: 'install', run: 'mise run setup:ci', network: { reason: 'downloads the locked dependencies' } }],
  commandsBeforeAcceptance: [
    { name: 'lint-app', run: 'mise run lint:app' },
    { name: 'lint-helm', run: 'mise run lint:helm' },
  ],
  commandsAfterAcceptance: [{ name: 'app-tests', run: 'npm run test --workspace app' }],
  stepTimeoutMs: 120_000,
  dryTimeoutMs: 30_000,
  setupTimeoutMs: 600_000,
};

function preflight(runner: ScriptedCommandRunner, workspaces = new RecordingWorkspaces(), settings = SETTINGS) {
  const shell = new ShellCommands(runner, new RecordingSandbox(), {}, 1_000, 10);
  return { workspaces, preflight: new GatePreflight({ workspaces, shell }, settings) };
}

describe('gate preflight', () => {
  it('runs setup then every gate step under the sandbox in a clean base workspace, and reports each step', async () => {
    const runner = new ScriptedCommandRunner()
      .onMatching(() => true, () => ({ exitCode: 0 }))
      .on('mise run lint:helm', () => ({ exitCode: 1, output: 'Error: dial tcp: lookup raw.githubusercontent.com: no such host' }))
      .on('npm run test --workspace app', () => ({ exitCode: 143, output: 'RUN v3 app', timedOut: true }));
    const { preflight: subject, workspaces } = preflight(runner);
    const reports = await subject.run();
    expect(reports.map((entry) => [entry.name, entry.verdict, entry.blocking])).toEqual([
      ['install', 'passed', false],
      ['lint-app', 'passed', false],
      ['lint-helm', 'network-undeclared', true],
      ['app-tests', 'unfinished', false],
    ]);
    expect(reports[2]?.detail).toContain('add "network: <reason>" to lint-helm');
    expect(workspaces.opened).toEqual([PREFLIGHT_WORKSPACE_NAME]);
    expect(workspaces.removed).toEqual([`/pool/base-workspaces/${PREFLIGHT_WORKSPACE_NAME}`]);
    expect(runner.executed.every((entry) => entry.argv[0] === 'nice' && entry.argv.includes('sandbox'))).toBe(true);
    expect(runner.executed.find((entry) => entry.command === 'mise run setup:ci')?.argv).toContain('online');
    expect(runner.executed.find((entry) => entry.command === 'mise run lint:helm')?.argv).toContain('offline');
    expect(runner.executed.map((entry) => entry.command)).toEqual([
      'mise run setup:ci',
      'mise tasks info lint:app',
      'mise run lint:app',
      'mise tasks info lint:helm',
      'mise run lint:helm',
      'npm run --workspace app',
      'npm run test --workspace app',
    ]);
  });

  it('stops at a dry form that fails and does not run the step itself', async () => {
    const runner = new ScriptedCommandRunner()
      .onMatching(() => true, () => ({ exitCode: 0 }))
      .on('mise tasks info lint:app', () => ({ exitCode: 1, output: 'mise ERROR no task lint:app found' }));
    const reports = await preflight(runner).preflight.run();
    expect(reports.find((entry) => entry.name === 'lint-app')).toMatchObject({ verdict: 'failed', blocking: true });
    expect(reports.find((entry) => entry.name === 'lint-app')?.detail).toContain('mise tasks info lint:app');
    expect(runner.count('mise run lint:app')).toBe(0);
  });

  it('skips the gate steps when a setup step does not pass', async () => {
    const runner = new ScriptedCommandRunner().on('mise run setup:ci', () => ({ exitCode: 1, output: 'npm ERR! code E401' }));
    const reports = await preflight(runner).preflight.run();
    expect(reports.map((entry) => entry.verdict)).toEqual(['failed', 'skipped', 'skipped', 'skipped']);
    expect(reports[1]?.detail).toBe('skipped: the setup step install did not pass');
  });

  it('reports every step as not runnable when the workspace cannot be prepared', async () => {
    const workspaces = new RecordingWorkspaces();
    workspaces.failure = new Error('fatal: not a git repository');
    const reports = await preflight(new ScriptedCommandRunner(), workspaces).preflight.run();
    expect(reports.every((entry) => entry.verdict === 'not-runnable' && entry.detail.includes('not a git repository'))).toBe(true);
  });

  it('opens no workspace when nothing is configured', async () => {
    const workspaces = new RecordingWorkspaces();
    const empty = { ...SETTINGS, setupCommands: [], commandsBeforeAcceptance: [], commandsAfterAcceptance: [] };
    expect(await preflight(new ScriptedCommandRunner(), workspaces, empty).preflight.run()).toEqual([]);
    expect(workspaces.opened).toEqual([]);
  });
});

describe('dry forms', () => {
  it('derives a cheap form for the runners it knows, and none for the others', () => {
    expect(dryFormOf('mise run test:agent')?.command).toBe('mise tasks info test:agent');
    expect(dryFormOf('npm run test --workspace app')?.command).toBe('npm run --workspace app');
    expect(dryFormOf('npm run lint')?.command).toBe('npm run');
    expect(dryFormOf('uv run --directory agent pytest')?.command).toBe('uv run --offline --no-sync python --version');
    expect(dryFormOf('make lint')).toBeNull();
  });
});
