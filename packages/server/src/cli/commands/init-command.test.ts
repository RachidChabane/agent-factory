import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpawnCommandRunner } from '@agent-factory/adapters';
import { loadAgentFactoryConfig } from '../../config/agent-factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import { runCli } from '../factory-cli.ts';
import { capturedOutput, cliContext, gitIn, REAL_GIT_TEST_TIMEOUT_MS, seedRepository, type CapturedOutput } from '../testing/cli-harness.ts';

describe('init', () => {
  let root: string;
  let home: string;
  let captured: CapturedOutput;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-init-')));
    home = join(root, 'home');
    captured = capturedOutput();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function context(overrides: Partial<CliContext> = {}): CliContext {
    const environment = { ...process.env, AGENT_FACTORY_HOME: home };
    return cliContext(home, captured, () => loadAgentFactoryConfig(environment, root), { environment, runner: new SpawnCommandRunner(), userHome: root, workingDirectory: root, ...overrides });
  }

  async function nodeRepository(name: string, origin: string | null): Promise<string> {
    const path = join(root, name);
    await mkdir(path);
    await writeFile(join(path, 'package.json'), JSON.stringify({ name, scripts: { lint: 'eslint .', test: 'node --test' } }));
    await writeFile(join(path, 'package-lock.json'), '{}');
    seedRepository(path, origin);
    gitIn(path, 'config', 'user.name', 'Dana Reyes');
    gitIn(path, 'config', 'user.email', 'dana.reyes@example.com');
    gitIn(path, 'add', '.');
    gitIn(path, 'commit', '--quiet', '-m', 'feat: first version');
    gitIn(path, 'tag', 'v1.0.0');
    return path;
  }

  it(
    'adds a GitHub repository as a project, with its build, release model and own clone',
    async () => {
      await nodeRepository('storefront', 'git@github.com:example-org/storefront.git');
      expect(await runCli(['init', 'storefront'], context())).toBe(0);
      const config = await loadAgentFactoryConfig({ AGENT_FACTORY_HOME: home }, root);
      const [project] = config.projects;
      expect(project).toMatchObject({
        id: 'storefront',
        forge: { kind: 'github' },
        repository: { owner: 'example-org', name: 'storefront' },
        baseBranch: 'main',
        commitIdentity: { name: 'Dana Reyes', email: 'dana.reyes@example.com' },
        setupCommands: [{ name: 'install', run: 'npm ci', network: { reason: 'downloads the locked dependencies from the package registry' } }],
        gate: { commandsBeforeAcceptance: [{ name: 'lint', run: 'npm run lint' }], commandsAfterAcceptance: [{ name: 'test', run: 'npm run test' }] },
        delivery: { release: { kind: 'tags' } },
      });
      expect(gitIn(`${home}/projects/storefront/clone`, 'remote', 'get-url', 'origin')).toBe('git@github.com:example-org/storefront.git');
      expect(captured.lines).toContain(`Project storefront written to ${home}/config.yaml`);
      expect(captured.lines.at(-1)).toContain('"agent-factory validate"');
    },
    REAL_GIT_TEST_TIMEOUT_MS,
  );

  it(
    'puts a repository without a GitHub origin on a local forge, and appends it to an existing configuration',
    async () => {
      await nodeRepository('storefront', 'git@github.com:example-org/storefront.git');
      await nodeRepository('Ledger API', null);
      expect(await runCli(['init', 'storefront'], context())).toBe(0);
      expect(await runCli(['init', 'Ledger API', '--name', 'Ledger'], context())).toBe(0);
      const config = await loadAgentFactoryConfig({ AGENT_FACTORY_HOME: home }, root);
      expect(config.projects.map((project) => [project.id, project.name, project.forge.kind])).toEqual([
        ['storefront', 'storefront', 'github'],
        ['ledger-api', 'Ledger', 'local'],
      ]);
      expect(gitIn(`${home}/projects/ledger-api/clone`, 'remote', 'get-url', 'origin')).toBe(`${home}/projects/ledger-api/forge/Ledger-API.git`);
      expect(captured.lines.some((line) => line.startsWith('Project ledger-api written to') && line.includes('previous file kept as'))).toBe(true);
    },
    REAL_GIT_TEST_TIMEOUT_MS,
  );

  it(
    'refuses to declare a project twice, and replaces it with --force while keeping its clone',
    async () => {
      await nodeRepository('storefront', 'git@github.com:example-org/storefront.git');
      expect(await runCli(['init', 'storefront'], context())).toBe(0);
      expect(await runCli(['init', 'storefront', '--name', 'Shop'], context())).toBe(1);
      expect(captured.errors.at(-1)).toContain('already declares a project storefront');
      expect(await runCli(['init', 'storefront', '--name', 'Shop', '--force'], context())).toBe(0);
      expect((await loadAgentFactoryConfig({ AGENT_FACTORY_HOME: home }, root)).projects.map((project) => project.name)).toEqual(['Shop']);
      expect(captured.lines).toContain(`Clone: kept the existing clone ${home}/projects/storefront/clone`);
    },
    REAL_GIT_TEST_TIMEOUT_MS,
  );

  it('asks for a local forge when GitHub is requested for a repository without a GitHub origin', async () => {
    await nodeRepository('notes', 'https://git.example.com/team/notes.git');
    expect(await runCli(['init', 'notes', '--forge', 'github'], context())).toBe(1);
    expect(captured.errors.at(-1)).toContain('has no GitHub origin; pass --forge local');
  });

  it('refuses a directory that is not a repository and an id the configuration cannot hold', async () => {
    await mkdir(join(root, 'plain'));
    expect(await runCli(['init', 'plain'], context())).toBe(1);
    expect(captured.errors.at(-1)).toContain('is not a git repository');
    await nodeRepository('storefront', 'git@github.com:example-org/storefront.git');
    expect(await runCli(['init', 'storefront', '--id', 'Store Front'], context())).toBe(1);
    expect(captured.errors.at(-1)).toContain('"Store Front" cannot be a project id');
    await expect(readFile(join(home, 'config.yaml'), 'utf8')).rejects.toThrow();
  });
});
