import { COCKPIT_DEV_SERVER_PORT } from '@agent-factory/cockpit';
import { describe, expect, it } from 'vitest';
import { configBackupsDirectory } from '../config/config-file.ts';
import { parseFactoryConfig } from '../config/factory-config.ts';
import { ListeningPorts } from './listening-ports.ts';
import { agentDeniedReadPaths, commandSandbox, credentialPaths, factoryListeningPorts, factoryPrivatePaths } from './confinement.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;
const CONFIG = `
target: { owner: acme, name: widgets, clonePath: clone }
roles:
  acceptance-author: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
  implementer: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5, escalation: { model: sonnet, effort: medium } }
  reviewer: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
gate: {}
conventionalCommits: { defaultScope: repo }
github: { commitIdentity: { name: Bot, email: bot@example.invalid } }
claude: { writableDirectories: [cache], accounts: [{ name: primary, configDir: ~/.claude-primary }] }
sandbox: { deniedReadPaths: ['~/.kube*'] }
`;

function encloses(directory: string, path: string): boolean {
  return path === directory || path.startsWith(`${directory}/`);
}

const config = parseFactoryConfig(CONFIG, HOME, `${HOME}/config.yaml`, USER_HOME);

describe('confinement', () => {
  it('adds the operator paths to the built-in credential stores', () => {
    expect(credentialPaths(config)).toEqual(expect.arrayContaining(['~/.ssh', '~/.config/gcloud', '~/Library/Keychains', `${USER_HOME}/.kube*`]));
  });

  it('leaves the worktrees and the audit and challenge checkouts readable by agent runs', () => {
    for (const directory of [config.worktreePool.directory, config.directories.checkouts]) {
      expect(agentDeniedReadPaths(config).filter((path) => encloses(path, `${directory}/slot`))).toEqual([]);
    }
  });

  it('keeps the factory state, runs and accounts out of reach of check commands', () => {
    expect(factoryPrivatePaths(config)).toEqual(
      expect.arrayContaining([config.directories.state, config.directories.runs, config.directories.checkouts, `${USER_HOME}/.claude-primary`]),
    );
  });

  it('keeps the backups of the configuration out of reach of agent runs and check commands', () => {
    const backups = `${configBackupsDirectory(config.directories.state)}/config-2026-10-10T07-30-00-000Z-0a1b2c3d.yaml`;
    expect(agentDeniedReadPaths(config).some((path) => encloses(path, backups))).toBe(true);
    expect(factoryPrivatePaths(config).some((path) => encloses(path, backups))).toBe(true);
  });

  it('blocks the configured server port and the cockpit dev server from check commands, with or without the network', () => {
    expect(factoryListeningPorts(config)).toEqual([config.server.port, COCKPIT_DEV_SERVER_PORT]);
    for (const network of [false, true]) {
      const [, , profile] = commandSandbox(config, USER_HOME).confine(['/bin/sh', '-c', 'npm test'], { workingDirectory: `${config.worktreePool.directory}/slot-1`, network });
      expect(profile).toContain(`(remote ip "*:${config.server.port}")`);
      expect(profile).toContain(`(remote ip "*:${COCKPIT_DEV_SERVER_PORT}")`);
    }
  });

  it('blocks the port a listener actually bound once it is registered, as for a configured port of 0', () => {
    const listening = new ListeningPorts(factoryListeningPorts({ ...config, server: { ...config.server, port: 0 } }));
    const sandbox = commandSandbox(config, USER_HOME, listening);
    const scope = { workingDirectory: `${config.worktreePool.directory}/slot-1`, network: false };
    expect(sandbox.confine(['true'], scope)[2]).not.toContain('"*:40123"');
    listening.register(40_123);
    expect(sandbox.confine(['true'], scope)[2]).toContain('(remote ip "*:40123")');
  });

  it('confines a check command in a worktree to the worktree, the caches and the temporary directories', () => {
    const [, , profile] = commandSandbox(config, USER_HOME).confine(['/bin/sh', '-c', 'npm test'], {
      workingDirectory: `${config.worktreePool.directory}/slot-1`,
      network: false,
    });
    expect(profile).toContain(`(subpath "${USER_HOME}/.ssh")`);
    expect(profile).toContain(`(subpath "${config.directories.runs}")`);
    expect(profile).toContain(`(regex #"^\\/Users\\/operator\\/\\.kube")`);
    expect(profile).toContain(`(subpath "${config.worktreePool.directory}/slot-1")`);
    expect(profile).toContain(`(subpath "${HOME}/cache")`);
    expect(profile).toContain(`(subpath "${USER_HOME}/.npm")`);
  });
});
