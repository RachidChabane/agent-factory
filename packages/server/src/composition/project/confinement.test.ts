import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { referenceSnapshotPath } from '@agent-factory/application';
import { COCKPIT_DEV_SERVER_PORT } from '@agent-factory/cockpit';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf } from '../../config/agent-factory-config.ts';
import { configBackupsDirectory } from '../../config/config-file.ts';
import { factoryPorts, ListeningPorts } from '../listening-ports.ts';
import {
  agentDeniedReadPaths,
  agentShellCommands,
  commandSandbox,
  commandWritableDirectories,
  CONTAINER_ENGINE_COMMANDS,
  credentialPaths,
  installationPrivatePaths,
  otherProjectsDirectories,
  projectEngineSockets,
  projectPrivatePaths,
} from './confinement.ts';
import { referenceSnapshotDirectories } from './references.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;
const REFERENCES = [
  { name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0', source: '~/src/design-tokens' },
  { name: 'icons', repository: 'example-org/icons', ref: 'v2', source: '~/src/icons' },
];

function project(id: string, forge: Record<string, unknown>, sandbox: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name: id, forge, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, sandbox: { deniedReadPaths: ['~/.kube*'], ...sandbox } };
}

function configText(): string {
  return stringify({
    version: 1,
    claude: { writableDirectories: ['cache'], accounts: [{ name: 'primary', configDir: '~/.claude-primary' }] },
    defaults: { sandbox: { allowedDomains: ['registry.npmjs.org'], shellCommands: ['npm view *'] } },
    projects: [
      { ...project('storefront', { kind: 'github', repository: 'example-org/storefront' }), references: REFERENCES },
      {
        ...project('ledger', { kind: 'local', repository: 'example-org/ledger' }, { docker: true, shellCommands: ['go vet *'], allowedDomains: ['proxy.golang.org'] }),
        setup: [{ name: 'install', run: 'go mod download', network: 'downloads the modules' }],
        gate: { afterAcceptance: [{ name: 'test', run: 'go test ./...' }] },
      },
    ],
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
  return commandSandbox(config, storefront, { platform, home: USER_HOME, environment: {}, listening });
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
      const sandbox = commandSandbox(local, own, { platform: 'linux', home: operator, environment: {}, listening: new ListeningPorts(factoryPorts(local.server.port)) });
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

  it("lets the writing agents run the project's own setup and gate commands and the commands it declares, under the installation's", () => {
    expect(agentShellCommands(ledger)).toEqual(['go mod download*', 'go test ./...*', 'npm view *', 'go vet *', ...CONTAINER_ENGINE_COMMANDS]);
    expect(agentShellCommands(storefront)).toEqual(['npm view *']);
    expect(ledger.sandbox.allowedDomains).toEqual(['registry.npmjs.org', 'proxy.golang.org']);
  });

  it('grants the container engine only to a project that asks for it, and only the engine sockets present on the machine', async () => {
    const operator = await realpath(await mkdtemp(join(tmpdir(), 'factory-engine-')));
    try {
      const socket = join(operator, 'engine.sock');
      await writeFile(socket, '');
      const environment = { DOCKER_HOST: `unix://${socket}`, XDG_RUNTIME_DIR: join(operator, 'runtime') };
      expect(projectEngineSockets(ledger, { platform: 'darwin', home: operator, environment })()).toContain(socket);
      expect(projectEngineSockets(storefront, { platform: 'darwin', home: operator, environment })()).toEqual([]);
      const granted = commandSandbox(config, ledger, { platform: 'darwin', home: operator, environment, listening: LISTENING });
      const refused = commandSandbox(config, storefront, { platform: 'darwin', home: operator, environment, listening: LISTENING });
      const scope = { workingDirectory: `${ledger.worktreePool.directory}/slot-1`, network: false };
      expect(granted.confine(['docker', 'ps'], scope)[2]).toContain(`(remote unix-socket (literal "${socket}"))`);
      expect(refused.confine(['docker', 'ps'], { ...scope, workingDirectory: SLOT })[2]).not.toContain(socket);
    } finally {
      await rm(operator, { recursive: true, force: true });
    }
  });

  describe('the snapshots of its references', () => {
    const snapshots = storefront.references.map((reference) => referenceSnapshotPath(storefront.directories.references, reference));

    it("are named from the project's configuration alone, built or not", () => {
      expect(snapshots).toEqual([`${storefront.directory}/references/design-tokens@v1.0.0`, `${storefront.directory}/references/icons@v2`]);
      expect(referenceSnapshotDirectories(storefront)).toEqual(snapshots);
      expect(referenceSnapshotDirectories(ledger)).toEqual([]);
    });

    it('are readable by the agent runs and the commands of their own project', () => {
      const denied = [
        ...agentDeniedReadPaths(config, storefront),
        ...credentialPaths(storefront),
        ...installationPrivatePaths(config),
        ...projectPrivatePaths(storefront),
        ...otherProjectsDirectories(config, storefront),
      ];
      for (const snapshot of snapshots) expect(denied.some((path) => encloses(path, `${snapshot}/icons/logo.svg`))).toBe(false);
    });

    it('are out of reach of every other project, agents and commands alike', () => {
      for (const snapshot of snapshots) {
        expect(agentDeniedReadPaths(config, ledger).some((path) => encloses(path, `${snapshot}/tokens.json`))).toBe(true);
        expect(otherProjectsDirectories(config, ledger).some((path) => encloses(path, snapshot))).toBe(true);
      }
      const [, , profile] = commandSandbox(config, ledger, { platform: 'darwin', home: USER_HOME, environment: {}, listening: LISTENING }).confine(['true'], {
        workingDirectory: `${ledger.worktreePool.directory}/slot-1`,
        network: false,
      });
      expect(profile).toContain(`(subpath "${storefront.directory}")`);
      for (const snapshot of snapshots) expect(profile).not.toContain(snapshot);
    });

    it('lie inside no directory a run or a command may write', () => {
      const writable = [
        storefront.worktreePool.directory,
        storefront.directories.checkouts,
        ...config.claude.writableDirectories,
        ...commandWritableDirectories(config, storefront, 'darwin', USER_HOME),
        ...commandWritableDirectories(config, storefront, 'linux', USER_HOME),
      ];
      for (const snapshot of snapshots) expect(writable.some((directory) => encloses(directory, snapshot))).toBe(false);
    });

    it('are read-only to the commands of their project on macOS: readable inside a denied directory, never writable inside a writable one', () => {
      const profile = sandboxOf('darwin').confine(['/bin/sh', '-c', 'cp -R snapshot .'], { workingDirectory: SLOT, network: false })[2] ?? '';
      const grants = snapshots.map((snapshot) => `(subpath "${snapshot}")`).join('\n  ');
      expect(profile).toContain(`(allow file-read*\n  ${grants})`);
      expect(profile).toContain(`(deny file-write*\n  ${grants})`);
      expect(profile.lastIndexOf('(deny file-write*')).toBeGreaterThan(profile.indexOf('(allow file-write*'));
    });

    it('are bound read-only last for the commands of their project under bubblewrap', async () => {
      const operator = await realpath(await mkdtemp(join(tmpdir(), 'factory-snapshot-confinement-')));
      try {
        const home = join(operator, '.agent-factory');
        const local = parseAgentFactoryConfig(configText(), home, join(home, 'config.yaml'), operator);
        const own = projectOf(local, 'storefront');
        const slot = join(own.worktreePool.directory, 'slot-1');
        await mkdir(slot, { recursive: true });
        const [first] = referenceSnapshotDirectories(own);
        const command = commandSandbox(local, own, { platform: 'linux', home: operator, environment: {}, listening: new ListeningPorts(factoryPorts(local.server.port)) })
          .confine(['true'], { workingDirectory: slot, network: false })
          .join(' ');
        expect(command).toContain(`--ro-bind-try ${first} ${first}`);
        expect(command.indexOf(`--ro-bind-try ${first}`)).toBeGreaterThan(command.indexOf(`--bind ${slot} ${slot}`));
      } finally {
        await rm(operator, { recursive: true, force: true });
      }
    });
  });
});
