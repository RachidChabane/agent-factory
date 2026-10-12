import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpawnCommandRunner } from '@agent-factory/adapters';
import { issueSubject } from '@agent-factory/domain';
import type { AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import { openInstallation } from '../../composition/installation/installation-runtime.ts';
import type { CliContext } from '../cli-context.ts';
import { runCli } from '../factory-cli.ts';
import { capturedOutput, cliContext, configText, gitIn, healthyRunner, parseConfig, REAL_GIT_TEST_TIMEOUT_MS, seedRepository, SPEC_FILE, type CapturedOutput } from '../testing/cli-harness.ts';

const LOCAL_ONLY = ['gadgets'] as const;

describe('rehearsal on a local forge', () => {
  let home: string;
  let config: AgentFactoryConfig;
  let captured: CapturedOutput;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-rehearsal-cli-')));
    config = parseConfig(configText(LOCAL_ONLY), home);
    captured = capturedOutput();
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function context(overrides: Partial<CliContext> = {}): CliContext {
    return cliContext(home, captured, () => Promise.resolve(config), {
      environment: { ...process.env, AGENT_FACTORY_HOME: home, USER: 'alex' },
      runner: new SpawnCommandRunner(),
      openInstallation: (loaded, overrides_ = {}) => openInstallation(loaded, { ...process.env, AGENT_FACTORY_HOME: home }, { userHome: home, ...overrides_ }),
      ...overrides,
    });
  }

  it('refuses the rehearsal commands on a project whose forge is GitHub', async () => {
    config = parseConfig(configText(), home);
    expect(await runCli(['rehearsal', 'init', home], context({ runner: healthyRunner(home) }))).toBe(1);
    expect(await runCli(['rehearsal', 'add-issue', join(home, 'spec.md')], context({ runner: healthyRunner(home) }))).toBe(1);
    expect(await runCli(['rehearsal', 'reset', home], context({ runner: healthyRunner(home) }))).toBe(1);
    expect(captured.errors).toHaveLength(3);
    expect(captured.errors.every((error) => error.includes('whose forge is local; widgets uses github'))).toBe(true);
  });

  it(
    'mirrors a source clone, resets it, and files local issues from spec files',
    async () => {
      const source = join(home, 'source');
      await mkdir(source);
      seedRepository(source, 'git@github.com:acme/gadgets.git');
      expect(await runCli(['rehearsal', 'init', source], context())).toBe(0);
      const bare = `${home}/projects/gadgets/forge/gadgets.git`;
      const clone = `${home}/projects/gadgets/clone`;
      expect(captured.lines[0]).toBe(`Local forge of gadgets (created): ${bare}`);

      const sourceBase = gitIn(source, 'rev-parse', 'HEAD');
      gitIn(clone, 'commit', '--allow-empty', '--quiet', '-m', 'merged rehearsal pull request');
      gitIn(clone, 'push', '--quiet', 'origin', 'HEAD:main');
      expect(await runCli(['rehearsal', 'reset', source], context())).toBe(0);
      expect(captured.lines.at(-1)).toBe(`Base main of ${bare} and ${clone} reset to ${sourceBase}`);

      await writeFile(join(home, 'spec.md'), SPEC_FILE);
      expect(await runCli(['rehearsal', 'add-issue', 'spec.md', '--labels', 'type:infra,spec:validated'], context())).toBe(0);
      expect(captured.lines.at(-1)).toBe('Local issue gadgets#1: Serve the domain from the UI [type:infra, spec:validated]');
      expect(await readFile(`${home}/projects/gadgets/forge/issues/1.md`, 'utf8')).toContain('## Acceptance criteria\n1. The production values declare the route.');

      await writeFile(join(home, 'spec.md'), SPEC_FILE.replace('## Out of scope\n- DNS records.\n', ''));
      expect(await runCli(['rehearsal', 'add-issue', 'spec.md'], context())).toBe(1);
      expect(captured.errors.at(-1)).toContain('section "## Out of scope" is missing');
    },
    REAL_GIT_TEST_TIMEOUT_MS,
  );

  it(
    'creates an issue as a draft, or validated when the operator orders it started',
    async () => {
      const source = join(home, 'source');
      await mkdir(source);
      seedRepository(source, null);
      expect(await runCli(['rehearsal', 'init', source], context())).toBe(0);
      await writeFile(join(home, 'spec.md'), SPEC_FILE);
      expect(await runCli(['issue', 'create', 'spec.md'], context())).toBe(0);
      expect(captured.lines.at(-1)).toBe('gadgets#1 created on the local forge of acme/gadgets (' + `${home}/projects/gadgets/forge) [factory, type:infra]; validate it (spec:validated) once you have reviewed it`);
      expect(await runCli(['issue', 'create', 'spec.md', '--start'], context())).toBe(0);
      expect(captured.lines.at(-1)).toBe('gadgets#2 created on the local forge of acme/gadgets (' + `${home}/projects/gadgets/forge) [factory, type:infra] and validated: the factory takes it at its next tick`);
      expect(await readFile(`${home}/projects/gadgets/forge/issues/2.md`, 'utf8')).toContain('  - spec:validated');
    },
    REAL_GIT_TEST_TIMEOUT_MS,
  );

  it(
    'validates a clone of the local forge without asking GitHub anything',
    async () => {
      const source = join(home, 'source');
      await mkdir(source);
      seedRepository(source, 'git@github.com:acme/gadgets.git');
      expect(await runCli(['rehearsal', 'init', source], context())).toBe(0);
      expect(await runCli(['validate', '--skip-gate-preflight'], context())).toBe(0);
      expect(captured.lines.some((line) => line.startsWith('ok   gh'))).toBe(false);
      expect(captured.lines.some((line) => line.includes('labels'))).toBe(false);
      expect(captured.lines).toContain(`ok   gadgets: clone: ${home}/projects/gadgets/clone (local forge ${home}/projects/gadgets/forge/gadgets.git)`);
    },
    REAL_GIT_TEST_TIMEOUT_MS,
  );

  it(
    'abandons an escalated issue, frees its worktree, and refuses while the factory runs',
    async () => {
      const source = join(home, 'source');
      await mkdir(source);
      seedRepository(source, null);
      expect(await runCli(['rehearsal', 'init', source], context())).toBe(0);
      const installation = await openInstallation(config, { ...process.env, AGENT_FACTORY_HOME: home }, { userHome: home });
      const { dependencies } = installation.project('gadgets');
      const worktree = await dependencies.pool.acquire(5, 'factory/5-keep-users-signed-in');
      await dependencies.states.transition(5, 'spec-draft', 'taken');
      await dependencies.states.transition(5, 'spec-validated', 'validated');
      await dependencies.events.append('pipeline.worktree-acquired', issueSubject(5), worktree);
      await dependencies.states.transition(5, 'authoring-checks', 'worktree ready');
      await dependencies.states.transition(5, 'needs-human', 'the implementer asked for a decision');
      installation.close();

      await mkdir(config.directories.state, { recursive: true });
      await writeFile(join(config.directories.state, 'factory.lock'), `${process.ppid}\n`);
      expect(await runCli(['issue', 'abandon', '5', '--reason', 'waits on an architecture decision'], context())).toBe(1);
      expect(captured.errors.at(-1)).toContain(`Factory process ${process.ppid} is running`);
      await rm(join(config.directories.state, 'factory.lock'));

      expect(await runCli(['issue', 'abandon', '5', '--reason', 'waits on an architecture decision'], context())).toBe(0);
      expect(captured.lines.slice(-2)).toEqual([
        `gadgets#5 abandoned: its worktree ${worktree.path} is free; the factory will not start it again.`,
        `Left as it is: the issue stays open on the local forge of acme/gadgets (${home}/projects/gadgets/forge); branch factory/5-keep-users-signed-in stays in ${home}/projects/gadgets/clone.`,
      ]);
      expect(await runCli(['status', '5'], context())).toBe(0);
      expect(captured.lines).toContain('State: abandoned');
      expect(captured.lines).toContain('Worktree: none');
      expect(await runCli(['issue', 'abandon', '5', '--reason', 'again'], context())).toBe(1);
      expect(captured.errors.at(-1)).toBe('Issue #5 cannot be abandoned: it is abandoned, not needs-human');
    },
    REAL_GIT_TEST_TIMEOUT_MS,
  );

  it('refuses to open a project whose clone still points at GitHub', async () => {
    const clone = `${home}/projects/gadgets/clone`;
    await mkdir(clone, { recursive: true });
    seedRepository(clone, 'git@github.com:acme/gadgets.git');
    await expect(openInstallation(config, { ...process.env, AGENT_FACTORY_HOME: home }, { userHome: home })).rejects.toThrow('not local paths');
  });
});
