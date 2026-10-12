import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpawnCommandRunner } from '@agent-factory/adapters';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentFactoryConfig } from '../config/agent-factory-config.ts';
import { runCli } from './factory-cli.ts';
import type { CliContext } from './cli-context.ts';
import { capturedOutput, cliContext, configText, gitIn, healthyRunner, parseConfig, REAL_GIT_TEST_TIMEOUT_MS, type CapturedOutput } from './testing/cli-harness.ts';

const TAG = 'v1.0.0';
const MISSING_TAG = 'v9.9.9';
const NO_INSTALLATION = 'this test opens no installation';

/** Sends git on the source clone and the extraction to the real tools, and everything else to the scripted machine. */
class ReferenceRoutingRunner implements CommandRunner {
  private readonly scripted: CommandRunner;
  private readonly real = new SpawnCommandRunner();
  private readonly sourceClone: string;

  constructor(scripted: CommandRunner, sourceClone: string) {
    this.scripted = scripted;
    this.sourceClone = sourceClone;
  }

  run(command: readonly string[], cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    const onReference = command[0] === 'tar' || cwd === this.sourceClone;
    return (onReference ? this.real : this.scripted).run(command, cwd, timeoutMs, env);
  }
}

describe('reference repositories on the command line', { timeout: REAL_GIT_TEST_TIMEOUT_MS }, () => {
  let home: string;
  let sourceClone: string;
  let commit: string;
  let captured: CapturedOutput;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-references-cli-')));
    sourceClone = join(home, 'design-tokens-source');
    captured = capturedOutput();
    await mkdir(sourceClone);
    gitIn(sourceClone, 'init', '--quiet', '--initial-branch', 'main');
    await writeFile(join(sourceClone, 'tokens.json'), '{"space":4}\n');
    gitIn(sourceClone, 'add', '--all');
    gitIn(sourceClone, 'commit', '--quiet', '--message', 'seed');
    gitIn(sourceClone, 'tag', TAG);
    commit = gitIn(sourceClone, 'rev-parse', 'HEAD');
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function configCiting(ref: string, projects: readonly ('widgets' | 'gadgets')[] = ['widgets']): AgentFactoryConfig {
    const reference = `{ name: design-tokens, repository: example-org/design-tokens, ref: ${ref}, source: ${sourceClone} }`;
    const text = projects.reduce((current, id) => current.replace(`  - id: ${id}\n`, `  - id: ${id}\n    references: [${reference}]\n`), configText(projects));
    return parseConfig(text, home);
  }

  function context(config: AgentFactoryConfig, overrides: Partial<CliContext> = {}): CliContext {
    return cliContext(home, captured, () => Promise.resolve(config), { runner: new ReferenceRoutingRunner(healthyRunner(home), sourceClone), ...overrides });
  }

  const snapshotPath = (project: string): string => join(home, 'projects', project, 'references', `design-tokens@${TAG}`);

  describe('validate', () => {
    it('builds the snapshot of a reference, then finds it unchanged', async () => {
      const config = configCiting(TAG);

      expect(await runCli(['validate', '--skip-gate-preflight'], context(config))).toBe(0);
      expect(await runCli(['validate', '--skip-gate-preflight'], context(config))).toBe(0);

      expect(captured.lines.filter((line) => line.includes(': reference '))).toEqual([
        `ok   widgets: reference design-tokens: example-org/design-tokens at ${TAG} is commit ${commit}, snapshot created at ${snapshotPath('widgets')}`,
        `ok   widgets: reference design-tokens: example-org/design-tokens at ${TAG} is commit ${commit}, snapshot unchanged at ${snapshotPath('widgets')}`,
      ]);
    });

    it('fails the line of the reference, with the fetch that brings the ref in, when the clone has no such ref', async () => {
      expect(await runCli(['validate', '--skip-gate-preflight'], context(configCiting(MISSING_TAG)))).toBe(1);

      const failure = captured.lines.find((line) => line.startsWith('FAIL widgets: reference design-tokens'));
      expect(failure).toBe(
        `FAIL widgets: reference design-tokens: ${sourceClone} has no ${MISSING_TAG} for example-org/design-tokens; update the clone with git -C ${sourceClone} fetch --tags`,
      );
    });

    it('fails the line of the reference when its source is not a clone', async () => {
      await rm(join(sourceClone, '.git'), { recursive: true, force: true });

      expect(await runCli(['validate', '--skip-gate-preflight'], context(configCiting(TAG)))).toBe(1);
      expect(captured.lines.find((line) => line.startsWith('FAIL widgets: reference design-tokens'))).toContain('cannot be read as a git clone');
    });

    it('leaves the snapshots alone offline, and says so', async () => {
      expect(await runCli(['validate', '--offline'], context(configCiting(TAG)))).toBe(0);

      expect(captured.lines).toContain('skip widgets: reference design-tokens: not run with --offline');
      expect(await readdir(join(home, 'projects')).catch(() => [])).toEqual([]);
    });

    it('prints no reference line for a project that cites none', async () => {
      expect(await runCli(['validate', '--skip-gate-preflight'], context(parseConfig(configText(), home)))).toBe(0);
      expect(captured.lines.some((line) => line.includes(': reference '))).toBe(false);
    });
  });

  describe('start', () => {
    it('builds the snapshots of every project before it opens the factory', async () => {
      expect(await runCli(['start'], context(configCiting(TAG)))).toBe(1);

      expect(captured.lines).toEqual([`widgets: reference design-tokens@${TAG} created at commit ${commit}`]);
      expect(captured.errors).toEqual([NO_INSTALLATION]);
    });

    it('says what it did to a snapshot it finds again', async () => {
      const config = configCiting(TAG);
      await runCli(['start'], context(config));
      captured.lines.length = 0;

      await runCli(['start'], context(config));

      expect(captured.lines).toEqual([`widgets: reference design-tokens@${TAG} unchanged at commit ${commit}`]);
    });

    it('refuses to start when a source lacks the ref, naming the project, the reference and the fetch', async () => {
      expect(await runCli(['start'], context(configCiting(MISSING_TAG)))).toBe(1);

      expect(captured.errors).toHaveLength(1);
      expect(captured.errors[0]).toContain('reference repositories are not ready:');
      expect(captured.errors[0]).toContain(`- widgets: reference design-tokens: ${sourceClone} has no ${MISSING_TAG}`);
      expect(captured.errors[0]).toContain(`git -C ${sourceClone} fetch --tags`);
      expect(captured.errors).not.toContain(NO_INSTALLATION);
    });

    it('lists every project whose reference cannot be built, after building those that can', async () => {
      const cite = (ref: string): string => `    references: [{ name: design-tokens, repository: example-org/design-tokens, ref: ${ref}, source: ${sourceClone} }]\n`;
      const text = configText(['widgets', 'gadgets']).replace('  - id: widgets\n', `  - id: widgets\n${cite(TAG)}`).replace('  - id: gadgets\n', `  - id: gadgets\n${cite(MISSING_TAG)}`);

      expect(await runCli(['start'], context(parseConfig(text, home)))).toBe(1);

      expect(captured.lines).toEqual([`widgets: reference design-tokens@${TAG} created at commit ${commit}`]);
      expect(captured.errors[0]).toContain(`- gadgets: reference design-tokens: ${sourceClone} has no ${MISSING_TAG}`);
      expect(captured.errors[0]).not.toContain('- widgets:');
    });

    it('builds snapshots only for the projects that cite references', async () => {
      const text = configText(['widgets', 'gadgets']).replace('  - id: widgets\n', `  - id: widgets\n    references: [{ name: design-tokens, repository: example-org/design-tokens, ref: ${TAG}, source: ${sourceClone} }]\n`);

      await runCli(['start'], context(parseConfig(text, home)));

      expect(await readdir(join(home, 'projects', 'widgets', 'references'))).toContain(`design-tokens@${TAG}`);
      expect(await readdir(join(home, 'projects'))).toEqual(['widgets']);
    });
  });

  describe('commands that run an agent', () => {
    it('bring the snapshots up to date before they open the project', async () => {
      expect(await runCli(['run-issue', '5'], context(configCiting(TAG)))).toBe(1);

      expect(captured.lines).toEqual([`widgets: reference design-tokens@${TAG} created at commit ${commit}`]);
      expect(captured.errors).toEqual([NO_INSTALLATION]);
    });

    it('refuse to run when a source lacks the ref', async () => {
      expect(await runCli(['run-issue', '5'], context(configCiting(MISSING_TAG)))).toBe(1);

      expect(captured.errors[0]).toContain('reference repositories are not ready:');
      expect(captured.errors).not.toContain(NO_INSTALLATION);
    });
  });
});
