import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ConfigInvalidError, factoryHome, parseFactoryConfig, resolvePath } from './factory-config.ts';
import { pipelineSettingsFrom } from './pipeline-settings-from-config.ts';

const EXAMPLE = new URL('../../../../config/config.example.yaml', import.meta.url);
const HOME = '/home/operator/.agent-factory';
const USER_HOME = '/home/operator';
const CONFIG_PATH = `${HOME}/config.yaml`;

const MINIMAL = `
target: { owner: acme, name: widgets, clonePath: /src/widgets }
roles:
  acceptance-author: { model: sonnet, effort: medium, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
  implementer: { model: sonnet, effort: high, maxBudgetUsd: 2, maxTurns: 20, timeoutMinutes: 10, escalation: { model: opus, effort: max } }
  reviewer: { model: sonnet, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
gate: {}
conventionalCommits: { defaultScope: repo }
github: { commitIdentity: { name: Bot, email: bot@example.invalid } }
`;

function parse(text: string): ReturnType<typeof parseFactoryConfig> {
  return parseFactoryConfig(text, HOME, CONFIG_PATH, USER_HOME);
}

describe('factory configuration', () => {
  it('accepts the committed example and resolves its paths', async () => {
    const config = parse(await readFile(EXAMPLE, 'utf8'));
    expect(config.target).toEqual({
      owner: 'example-owner',
      name: 'example-repository',
      clonePath: '/home/operator/src/example-repository',
      baseBranch: 'main',
      setupCommands: [
        { name: 'install', run: 'pnpm install --frozen-lockfile', network: { reason: 'downloads the locked dependencies from the package registry' } },
      ],
    });
    expect(config.concurrency).toEqual({ issues: 1, ceiling: 3 });
    expect(config.worktreePool).toEqual({ directory: `${HOME}/worktrees`, size: 3 });
    expect(config.directories.logs).toBe(`${HOME}/logs`);
    expect(config.roles.implementer.escalation).toEqual({ model: 'opus', effort: 'xhigh' });
    expect(config.roles.reviewer.timeoutMs).toBe(20 * 60_000);
    expect(config.gate.environmentSet).toEqual({
      MISE_TRUSTED_CONFIG_PATHS: '/home/operator/.agent-factory/worktrees',
      UV_CACHE_DIR: '/home/operator/.agent-factory/cache/uv',
      MISE_TASK_RUN_AUTO_INSTALL: 'false',
    });
    expect(config.claude.writableDirectories).toEqual([`${HOME}/cache`]);
  });

  it('fills defaults for every optional section', () => {
    const config = parse(MINIMAL);
    expect(config.concurrency).toEqual({ issues: 1, ceiling: 3 });
    expect(config.worktreePool.size).toBe(3);
    expect(config.resources).toEqual({ minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' });
    expect(config.gate.environmentPassthrough).toEqual([
      'PATH',
      'HOME',
      'LANG',
      'TERM',
      'TMPDIR',
      'USER',
      'MISE_DATA_DIR',
      'MISE_CONFIG_DIR',
      'MISE_CACHE_DIR',
      'MISE_STATE_DIR',
    ]);
    expect(config.target.setupCommands).toEqual([]);
    expect(config.claude).toEqual({ command: ['claude'], niceness: 10, writableDirectories: [], accounts: [] });
    expect(config.budget).toEqual({ thresholds: { session: 0.9, weekly_all: 0.85, weekly_scoped: 0.85 }, dailyCapUsd: null, perRunCapUsd: null });
    expect(config.daemon).toEqual({ pollIntervalMs: 30_000, mergeWatchIntervalMs: 600_000, issueRefreshMs: 120_000 });
    expect(config.notifications).toEqual({ googleChatWebhookVariable: null, dedupeWindowMs: 1_800_000 });
    expect(config.server).toEqual({ host: '127.0.0.1', port: 7430, publicUrl: 'http://127.0.0.1:7430', tailnet: false });
    expect(config.release).toEqual({ prepHealthChecks: [], productionWorkflowUrl: '' });
    expect(config.directories).toMatchObject({ requests: `${HOME}/requests`, knowledge: `${HOME}/knowledge`, checkouts: `${HOME}/checkouts`, runLogs: `${HOME}/logs/runs` });
    expect(config.target.baseBranch).toBe('main');
  });

  it('talks to GitHub unless the local rehearsal mode is chosen', () => {
    expect(parse(MINIMAL).github).toEqual({
      mode: 'remote',
      commitIdentity: { name: 'Bot', email: 'bot@example.invalid' },
      local: { directory: `${HOME}/github`, bareRepositoryPath: `${HOME}/github/widgets.git`, checks: 'none' },
    });
    const local = parse(
      MINIMAL.replace('github: {', 'github: { mode: local, localDirectory: ~/rehearsal, localChecks: success,'),
    );
    expect(local.github).toMatchObject({
      mode: 'local',
      local: { directory: `${USER_HOME}/rehearsal`, bareRepositoryPath: `${USER_HOME}/rehearsal/widgets.git`, checks: 'success' },
    });
    expect(() => parse(MINIMAL.replace('github: {', 'github: { mode: sandbox,'))).toThrow(ConfigInvalidError);
  });

  it('resolves the directories agents may write beyond their worktree', () => {
    const config = parse(`${MINIMAL}claude: { writableDirectories: [cache/uv, ~/shared] }\n`);
    expect(config.claude.writableDirectories).toEqual([`${HOME}/cache/uv`, `${USER_HOME}/shared`]);
  });

  it('reads the Claude accounts, the budget thresholds, the daemon cadence, the notification variable and the server', () => {
    const config = parse(
      `${MINIMAL}claude: { accounts: [{ name: primary, configDir: ~/.claude-primary }, { name: second, configDir: accounts/second }] }
budget: { fiveHourPauseUtilization: 0.8, sevenDayPauseUtilization: 0.7, dailyCapUsd: 40 }
daemon: { pollIntervalSeconds: 5, mergeWatchIntervalMinutes: 2, issueRefreshSeconds: 60 }
notifications: { googleChatWebhookUrl: { fromEnvironment: GOOGLE_CHAT_WEBHOOK }, dedupeWindowMinutes: 10 }
server: { port: 8080, publicUrl: https://factory.example.ts.net }
`,
    );
    expect(config.claude.accounts).toEqual([
      { name: 'primary', configDir: `${USER_HOME}/.claude-primary` },
      { name: 'second', configDir: `${HOME}/accounts/second` },
    ]);
    expect(config.budget).toEqual({ thresholds: { session: 0.8, weekly_all: 0.7, weekly_scoped: 0.7 }, dailyCapUsd: 40, perRunCapUsd: null });
    expect(config.daemon).toEqual({ pollIntervalMs: 5_000, mergeWatchIntervalMs: 120_000, issueRefreshMs: 60_000 });
    expect(config.notifications).toEqual({ googleChatWebhookVariable: 'GOOGLE_CHAT_WEBHOOK', dedupeWindowMs: 600_000 });
    expect(config.server).toEqual({ host: '127.0.0.1', port: 8080, publicUrl: 'https://factory.example.ts.net', tailnet: false });
  });

  it('rejects duplicate account names, utilizations above one and a webhook URL written in the file', () => {
    const account = '{ name: primary, configDir: a }';
    expect(() => parse(`${MINIMAL}claude: { accounts: [${account}, ${account}] }\n`)).toThrow('account names must be unique');
    expect(() => parse(`${MINIMAL}budget: { sevenDayPauseUtilization: 85 }\n`)).toThrow(ConfigInvalidError);
    expect(() => parse(`${MINIMAL}notifications: { googleChatWebhookUrl: https://chat.googleapis.com/v1/spaces/x }\n`)).toThrow(
      ConfigInvalidError,
    );
  });

  it('rejects concurrency above its ceiling or above the pool size', () => {
    expect(() => parse(`${MINIMAL}concurrency: { issues: 3, ceiling: 2 }\n`)).toThrow('must not exceed concurrency.ceiling');
    expect(() => parse(`${MINIMAL}concurrency: { ceiling: 5 }\n`)).toThrow('must not exceed worktreePool.size');
  });

  it('never lets a credential variable reach check commands', () => {
    expect(() => parse(MINIMAL.replace('gate: {}', 'gate: { environment: { passthrough: [PATH, GH_TOKEN] } }'))).toThrow(
      ConfigInvalidError,
    );
    expect(() => parse(MINIMAL.replace('gate: {}', 'gate: { environment: { set: { NPM_TOKEN: x } } }'))).toThrow(
      'credential variables never reach check commands',
    );
  });

  it('reports unknown keys and malformed YAML precisely', () => {
    expect(() => parse(`${MINIMAL}extra: true\n`)).toThrow(/extra/);
    expect(() => parse('target: [')).toThrow(ConfigInvalidError);
  });

  it('finds the factory home from AGENT_FACTORY_HOME or the user home', () => {
    expect(factoryHome({ AGENT_FACTORY_HOME: '/srv/factory' }, USER_HOME)).toBe('/srv/factory');
    expect(factoryHome({}, USER_HOME)).toBe('/home/operator/.agent-factory');
    expect(resolvePath('~/x', HOME, USER_HOME)).toBe('/home/operator/x');
    expect(resolvePath('/abs', HOME, USER_HOME)).toBe('/abs');
  });

  it('builds pipeline settings with an allowlisted check environment', async () => {
    const config = parse(await readFile(EXAMPLE, 'utf8'));
    const settings = pipelineSettingsFrom(config, {
      PATH: '/usr/bin',
      HOME: USER_HOME,
      MISE_DATA_DIR: '/tools',
      GH_TOKEN: 'secret',
      SSH_AUTH_SOCK: '/tmp/agent',
    });
    expect(settings.setupCommands).toEqual([
      { name: 'install', run: 'pnpm install --frozen-lockfile', network: { reason: 'downloads the locked dependencies from the package registry' } },
    ]);
    expect(settings.gate.environment).toEqual({
      PATH: '/usr/bin',
      HOME: USER_HOME,
      MISE_DATA_DIR: '/tools',
      MISE_TRUSTED_CONFIG_PATHS: '/home/operator/.agent-factory/worktrees',
      UV_CACHE_DIR: '/home/operator/.agent-factory/cache/uv',
      MISE_TASK_RUN_AUTO_INSTALL: 'false',
    });
    expect(settings.implementerEscalation).toEqual({ model: 'opus', effort: 'xhigh' });
    const { typology, defaultScope } = settings.conventions;
    expect(defaultScope).toBe('repo');
    expect(['ui', 'api', 'prompt', 'infra', 'docs', 'dependencies', 'fix'].map((type) => typology.get(type).commit.scope)).toEqual([
      'app',
      'api',
      'agent',
      'ci',
      'docs',
      'deps',
      null,
    ]);
    expect(typology.get('infra').commit.whenChanged).toEqual([{ paths: ['infrastructure/**', 'environments/**'], type: 'feat' }]);
  });

  it('confines check commands by default and lets the operator widen only what is listed', () => {
    const config = parse(MINIMAL);
    expect(config.sandbox).toEqual({
      deniedReadPaths: [],
      writableDirectories: ['/home/operator/.local/state/mise', '/home/operator/Library/Caches/mise', '/home/operator/.npm', '/home/operator/Library/Caches/node-gyp'],
    });
    expect(config.secretScan.keychainServices).toEqual(['figma-pat', 'gh:github.com']);
    const widened = parse(`${MINIMAL}sandbox: { deniedReadPaths: ['~/.kube*', /opt/secrets], writableDirectories: [cache/pip] }\n`);
    expect(widened.sandbox).toEqual({ deniedReadPaths: ['/home/operator/.kube*', '/opt/secrets'], writableDirectories: [`${HOME}/cache/pip`] });
  });

  it('keeps a network reason only on the commands that declare one', () => {
    const config = parse(MINIMAL.replace('gate: {}', "gate: { commandsAfterAcceptance: [{ name: audit, run: npm audit, network: 'queries the advisory database' }, { name: test, run: npm test }] }"));
    expect(config.gate.commandsAfterAcceptance).toEqual([
      { name: 'audit', run: 'npm audit', network: { reason: 'queries the advisory database' } },
      { name: 'test', run: 'npm test' },
    ]);
    expect(() => parse(MINIMAL.replace('gate: {}', "gate: { commandsAfterAcceptance: [{ name: test, run: npm test, network: '' }] }"))).toThrow(ConfigInvalidError);
  });

  it('accepts commit type overrides by issue type', () => {
    const config = parse(MINIMAL.replace('conventionalCommits: { defaultScope: repo }', 'conventionalCommits: { defaultScope: repo, types: { data: chore } }'));
    expect(config.conventionalCommits.types).toEqual({ data: 'chore' });
    expect(() => parse(MINIMAL.replace('conventionalCommits: { defaultScope: repo }', 'conventionalCommits: { defaultScope: repo, types: { data: feature } }'))).toThrow(
      ConfigInvalidError,
    );
  });
});
describe('delivery configuration', () => {
  it('reads the delivery workflow and the environments it targets', () => {
    const config = parse(`${MINIMAL}delivery: { workflow: cloud-delivery.yml, environments: { dev: { name: app-dev, url: https://dev.example.invalid }, prep: { name: app-prep } } }\n`);
    expect(config.delivery).toEqual({
      workflow: 'cloud-delivery.yml',
      environments: { dev: { name: 'app-dev', url: 'https://dev.example.invalid' }, prep: { name: 'app-prep', url: null } },
    });
    expect(parse(MINIMAL).delivery).toBeNull();
  });

  it('refuses a DEV or PREP target that names a production environment', () => {
    expect(() => parse(`${MINIMAL}delivery: { workflow: cloud-delivery.yml, environments: { prep: { name: app-prod } } }\n`)).toThrow(ConfigInvalidError);
  });
});
