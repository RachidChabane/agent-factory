import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COCKPIT_DEV_SERVER_PORT } from '@agent-factory/cockpit';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf } from '../../config/agent-factory-config.ts';
import { configBackupsDirectory } from '../../config/config-file.ts';
import { factoryPorts, ListeningPorts } from '../listening-ports.ts';
import { agentDeniedReadPaths, commandSandbox, credentialPaths, installationPrivatePaths, otherProjectsDirectories, projectPrivatePaths } from './confinement.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;

function project(id: string, forge: Record<string, unknown>): Record<string, unknown> {
  return { id, name: id, forge, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, sandbox: { deniedReadPaths: ['~/.kube*'] } };
}

function configText(): string {
  return stringify({
    version: 1,
    claude: { writableDirectories: ['cache'], accounts: [{ name: 'primary', configDir: '~/.claude-primary' }] },
    projects: [project('storefront', { kind: 'github', repository: 'example-org/storefront' }), project('ledger', { kind: 'local', repository: 'example-org/ledger' })],
  });
}

const config = parseAgentFactoryConfig(configText(), HOME, `${HOME}/config.yaml`, USER_HOME);
const storefront = projectOf(config, 'storefront');
const ledger = projectOf(config, 'ledger');
const LISTENING = new ListeningPorts(factoryPorts(config.server.port));
const SLOT = `${storefront.worktreePool.directory}/slot-1`;

function encloses(directory: string, path: string): boolean {
  return path === directory || path.startsWith(`${directory}/`);
}

function sandboxOf(platform: string, listening: ListeningPorts = LISTENING) {
  return commandSandbox(config, storefront, { platform, home: USER_HOME, listening });
}

describe('the confinement of a project', () => {
  it('adds the operator paths to the built-in credential stores', () => {
    expect(credentialPaths(storefront)).toEqual(expect.arrayContaining(['~/.ssh', '~/.config/gcloud', '~/Library/Keychains', `${USER_HOME}/.kube*`]));
  });

  it("leaves the project's worktrees and checkouts readable by its agent runs", () => {
    for (const directory of [storefront.worktreePool.directory, storefront.directories.checkouts]) {
      expect(agentDeniedReadPaths(config, storefront).filter((path) => encloses(path, `${directory}/slot`))).toEqual([]);
    }
  });

  it("keeps every other project's directory out of reach of the project's agent runs", () => {
    expect(otherProjectsDirectories(config, storefront)).toEqual([ledger.directory]);
    for (const path of [ledger.clonePath, `${ledger.worktreePool.directory}/slot-0/src/invoice.ts`, ledger.directories.requests]) {
      expect(agentDeniedReadPaths(config, storefront).some((denied) => encloses(denied, path))).toBe(true);
    }
  });

  it("keeps the installation's state, runs, accounts and configuration backups out of reach of check commands", () => {
    const backups = `${configBackupsDirectory(config.directories.state)}/config-2026-10-10T07-30-00-000Z-0a1b2c3d.yaml`;
    expect(installationPrivatePaths(config)).toEqual(expect.arrayContaining([config.configPath, config.directories.state, config.directories.runs, `${USER_HOME}/.claude-primary`]));
    expect(installationPrivatePaths(config).some((path) => encloses(path, backups))).toBe(true);
    expect(agentDeniedReadPaths(config, storefront).some((path) => encloses(path, backups))).toBe(true);
    expect(projectPrivatePaths(ledger)).toContain(`${ledger.directory}/forge`);
  });

  it('confines a check command on macOS to its worktree, the caches and the temporary directories, away from other projects', () => {
    const [, , profile] = sandboxOf('darwin').confine(['/bin/sh', '-c', 'npm test'], { workingDirectory: SLOT, network: false });
    expect(profile).toContain(`(subpath "${USER_HOME}/.ssh")`);
    expect(profile).toContain(`(subpath "${config.directories.runs}")`);
    expect(profile).toContain(`(subpath "${ledger.directory}")`);
    expect(profile).toContain(`(regex #"^\\/Users\\/operator\\/\\.kube")`);
    expect(profile).toContain(`(subpath "${SLOT}")`);
    expect(profile).toContain(`(subpath "${HOME}/cache")`);
    expect(profile).toContain(`(subpath "${USER_HOME}/.npm")`);
  });

  it('confines a check command on Linux under bubblewrap, with the state and every other project hidden', async () => {
    const operator = await realpath(await mkdtemp(join(tmpdir(), 'factory-confinement-')));
    try {
      const home = join(operator, '.agent-factory');
      const local = parseAgentFactoryConfig(configText(), home, join(home, 'config.yaml'), operator);
      const own = projectOf(local, 'storefront');
      const other = projectOf(local, 'ledger');
      const slot = join(own.worktreePool.directory, 'slot-1');
      for (const directory of [slot, other.clonePath, local.directories.state]) await mkdir(directory, { recursive: true });
      const sandbox = commandSandbox(local, own, { platform: 'linux', home: operator, listening: new ListeningPorts(factoryPorts(local.server.port)) });
      const command = sandbox.confine(['/bin/sh', '-c', 'npm test'], { workingDirectory: slot, network: false }).join(' ');
      expect(command).toMatch(/^\S*bwrap /);
      expect(command).toContain(`--tmpfs ${other.directory}`);
      expect(command).toContain(`--tmpfs ${local.directories.state}`);
      expect(command).toContain(`--bind ${slot} ${slot}`);
      expect(command).not.toContain(`--tmpfs ${own.directory} `);
      expect(command.endsWith('-- /bin/sh -c npm test')).toBe(true);
    } finally {
      await rm(operator, { recursive: true, force: true });
    }
  });

  it('blocks the configured server port and the cockpit dev server from check commands, with or without the network', () => {
    for (const network of [false, true]) {
      const [, , profile] = sandboxOf('darwin').confine(['/bin/sh', '-c', 'npm test'], { workingDirectory: SLOT, network });
      expect(profile).toContain(`(remote ip "*:${config.server.port}")`);
      expect(profile).toContain(`(remote ip "*:${COCKPIT_DEV_SERVER_PORT}")`);
    }
  });

  it('blocks the port a listener actually bound once it is registered, as for a configured port of 0', () => {
    const listening = new ListeningPorts(factoryPorts(0));
    const sandbox = sandboxOf('darwin', listening);
    const scope = { workingDirectory: SLOT, network: false };
    expect(sandbox.confine(['true'], scope)[2]).not.toContain('"*:40123"');
    listening.register(40_123);
    expect(sandbox.confine(['true'], scope)[2]).toContain('(remote ip "*:40123")');
  });
});
