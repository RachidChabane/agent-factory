import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventSourcedIssueStateStore } from '@agent-factory/adapters';
import { activePauses, ProjectEventStore } from '@agent-factory/application';
import { issueSubject } from '@agent-factory/domain';
import { ConfigMissingError, type AgentFactoryConfig } from '../config/agent-factory-config.ts';
import { openEventLog } from '../composition/installation/event-log.ts';
import { defaultCliContext, type CliContext } from './cli-context.ts';
import { runCli } from './factory-cli.ts';
import { openInstallation } from '../composition/installation/installation-runtime.ts';
import { capturedOutput, cliContext, configText, healthyRunner, parseConfig, SPEC_FILE, type CapturedOutput } from './testing/cli-harness.ts';

describe('the agent-factory command line', () => {
  let home: string;
  let config: AgentFactoryConfig;
  let captured: CapturedOutput;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-cli-')));
    config = parseConfig(configText(), home);
    captured = capturedOutput();
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function context(overrides: Partial<CliContext> = {}): CliContext {
    return cliContext(home, captured, () => Promise.resolve(config), overrides);
  }

  it('prints the usage on a malformed command line', async () => {
    expect(await runCli(['run-issue', 'abc'], context())).toBe(2);
    expect(captured.errors[0]).toContain('issue number must be a positive integer');
    expect(captured.errors[0]).toContain('Usage: agent-factory [--project <id>] <command>');
  });

  it('reports an issue unknown to the factory, named with its project', async () => {
    expect(await runCli(['status', '9'], context())).toBe(1);
    expect(captured.errors).toEqual(['widgets#9 is unknown to the factory']);
  });

  it('projects the status of an issue from the project events, and says what its cost figure means', async () => {
    const eventLog = openEventLog(config.directories.state);
    const events = new ProjectEventStore(eventLog.events, 'widgets');
    const states = new EventSourcedIssueStateStore(events);
    await states.transition(42, 'spec-draft', 'taken');
    await states.transition(42, 'spec-validated', 'validated');
    await states.transition(42, 'needs-human', 'the before proof is not valid: checks do not fail on base');
    await events.append('pipeline.worktree-acquired', issueSubject(42), { path: '/pool/slot-0', branch: 'factory/42-x', baseSha: 'abc' });
    eventLog.close();

    expect(await runCli(['status', '42'], context())).toBe(0);
    expect(captured.lines).toEqual([
      'widgets#42',
      'State: needs-human',
      'Needs human: the before proof is not valid: checks do not fail on base',
      'Branch: none',
      'Worktree: /pool/slot-0',
      'Before proof: none',
      'Frozen checks: none',
      'Implementer attempts: 0 (0 resumed, 0 escalated)',
      'Last gate: none',
      'Last review: none',
      'Pull request: none',
      'Agent cost: $0.00 (what the same usage would cost on the API; the subscription pays for it)',
    ]);
  });

  it('asks which project to act on when the installation has several', async () => {
    config = parseConfig(configText(['widgets', 'gadgets']), home);
    expect(await runCli(['status', '3'], context())).toBe(1);
    expect(captured.errors.at(-1)).toBe('this command acts on one project; name it with --project <id>, one of: widgets, gadgets');
    expect(await runCli(['--project', 'gadgets', 'status', '3'], context())).toBe(1);
    expect(captured.errors.at(-1)).toBe('gadgets#3 is unknown to the factory');
    expect(await runCli(['status', '3', '--project=nope'], context())).toBe(1);
    expect(captured.errors.at(-1)).toBe('no project "nope" in the configuration; known projects: widgets, gadgets');
  });

  it('validates the configuration, every tool the installation needs and each project', async () => {
    expect(await runCli(['validate'], context())).toBe(0);
    expect(captured.lines.map((line) => line.split(':')[0])).toEqual([
      'ok   configuration',
      'ok   git',
      'ok   gh',
      'ok   claude',
      'ok   command sandbox',
      'ok   role prompts',
      'ok   claude accounts',
      'ok   notifications',
      'ok   resources',
      'ok   widgets',
      'ok   widgets',
      'ok   widgets',
      'ok   widgets',
      'ok   widgets',
      'ok   widgets',
    ]);
    expect(captured.lines.slice(-6).map((line) => line.split(':')[1]?.trim())).toEqual(['clone', 'labels', 'prompts', 'knowledge', 'worktrees', 'sandbox']);
    expect(captured.lines.at(-2)).toBe(
      'ok   widgets: worktrees: a pool of 5 holds 1 issue at once beside up to 4 pull requests awaiting review (2 beside 3 at the ceiling); no new issue starts once pull requests and escalated issues hold all 5',
    );
    expect(captured.lines.at(-1)).toBe('ok   widgets: sandbox: agents and commands stay confined: no container engine, no network domain for agents');
  });

  it('says that a project merges with the administrator bypass, and what GitHub requires for it', async () => {
    config = parseConfig(configText().replace('forge: { kind: github, repository: acme/widgets }', 'forge: { kind: github, repository: acme/widgets, mergeWithBypass: true }'), home);
    expect(await runCli(['validate'], context())).toBe(0);
    expect(captured.lines.find((line) => line.startsWith('ok   widgets: merge'))).toBe(
      'ok   widgets: merge: squash merges with the administrator bypass (gh pr merge --admin): GitHub refuses it unless your login may bypass the review rule of acme/widgets@main',
    );
  });

  it('checks only what needs no command offline, and says what it left out', async () => {
    const runner = healthyRunner(home);
    expect(await runCli(['validate', '--offline'], context({ runner }))).toBe(0);
    expect(runner.asked).toEqual([]);
    expect(captured.lines.filter((line) => line.startsWith('skip')).map((line) => line.split(':').slice(0, -1).join(':'))).toEqual([
      'skip git',
      'skip gh',
      'skip claude',
      'skip command sandbox',
      'skip resources',
      'skip widgets: clone',
      'skip widgets: labels',
      'skip widgets: gate preflight',
    ]);
  });

  it('runs each setup and gate command on a clean base workspace and fails on an undeclared network need', async () => {
    config = parseConfig(
      configText().replace(
        '    conventions: { defaultScope: repo }',
        '    conventions: { defaultScope: repo }\n    setup: [{ name: install, run: npm ci, network: registry }]\n    gate: { beforeAcceptance: [{ name: lint, run: mise run lint }, { name: lint-helm, run: mise run lint:helm }] }',
      ),
      home,
    );
    const runner = healthyRunner(home)
      .answer('git', '')
      .answerShell('npm ci', 'added 412 packages')
      .answerShell('mise tasks info lint', 'Task lint')
      .answerShell('mise run lint', 'All files pass')
      .answerShell('mise tasks info lint:helm', 'Task lint:helm')
      .answerShell('mise run lint:helm', 'dial tcp: lookup charts.example.com: no such host', 1);
    expect(await runCli(['validate'], context({ runner }))).toBe(1);
    expect(captured.lines.filter((line) => line.includes('gate preflight'))).toEqual([
      'ok   widgets: gate preflight setup install: passed: passed on the clean base in 0 s',
      'ok   widgets: gate preflight before-acceptance lint: passed: passed on the clean base in 0 s',
      'FAIL widgets: gate preflight before-acceptance lint-helm: network-undeclared: needs the network but declares none (dial tcp: lookup charts.example.com: no such host); add "network: <reason>" to lint-helm',
    ]);
    expect(runner.asked.some((command) => command.includes(`worktree add --detach ${home}/projects/widgets/worktrees/base-workspaces/gate-preflight`))).toBe(true);
    expect(runner.asked.filter((command) => command.endsWith('mise run lint:helm')).every((command) => command.includes('/usr/bin/sandbox-exec'))).toBe(true);
  });

  it('skips the gate preflight on request', async () => {
    config = parseConfig(configText().replace('    conventions: { defaultScope: repo }', '    conventions: { defaultScope: repo }\n    gate: { beforeAcceptance: [{ name: lint, run: mise run lint }] }'), home);
    expect(await runCli(['validate', '--skip-gate-preflight'], context())).toBe(0);
    expect(captured.lines.some((line) => line.includes('gate preflight'))).toBe(false);
  });

  it('fails validation on an unpinned claude, short memory and a foreign clone', async () => {
    const runner = healthyRunner(home)
      .answer('claude --version', '9.9.9 (Claude Code)')
      .answer(`git -C ${home}/projects/widgets/clone remote get-url origin`, 'git@github.com:other/repo.git')
      .answer('memory_pressure -Q', 'System-wide memory free percentage: 12%');
    expect(await runCli(['validate'], context({ runner }))).toBe(1);
    expect(captured.lines.filter((line) => line.startsWith('FAIL'))).toEqual([
      expect.stringMatching(/^FAIL claude: /),
      'FAIL resources: 12% free memory, pressure normal: free memory 12% is below 40%',
      expect.stringMatching(/^FAIL widgets: clone: .* points at git@github.com:other\/repo.git, not acme\/widgets$/),
    ]);
  });

  it('fails validation when the repository lacks the labels the project puts on specs and pull requests', async () => {
    const runner = healthyRunner(home).answer('gh label list', JSON.stringify([{ name: 'factory' }, { name: 'bug' }]));
    expect(await runCli(['validate'], context({ runner }))).toBe(1);
    const labels = captured.lines.find((line) => line.startsWith('FAIL widgets: labels')) ?? '';
    expect(labels).toContain('acme/widgets lacks the labels spec:validated, audit, type:feature, type:fix, type:ui');
    expect(labels).not.toContain(' factory,');
  });

  it('warns about a declared tool that is missing without failing the validation', async () => {
    config = parseConfig(configText().replace('projects:\n', 'tools:\n  - { name: deployctl, check: [deployctl, whoami], install: brew install deployctl }\nprojects:\n'), home);
    const runner = healthyRunner(home).answer('deployctl whoami', 'deployctl: command not found', 127);
    expect(await runCli(['validate'], context({ runner }))).toBe(0);
    expect(captured.lines.find((line) => line.includes('tool deployctl'))).toMatch(/^warn tool deployctl: /);
  });

  it('stops at the configuration when it does not load', async () => {
    const missing = new ConfigMissingError(join(home, 'config.yaml'));
    expect(await runCli(['validate'], context({ loadConfig: () => Promise.reject(missing) }))).toBe(1);
    expect(captured.lines).toEqual([`FAIL configuration: ${missing.message}`]);
  });

  it('shows the issue it would create on GitHub and creates nothing without --confirm', async () => {
    await writeFile(join(home, 'spec.md'), SPEC_FILE);
    expect(await runCli(['issue', 'create', 'spec.md'], context())).toBe(5);
    expect(captured.lines.slice(0, 3)).toEqual(['This creates an issue on GitHub acme/widgets:', 'Title: Serve the domain from the UI', 'Labels: factory, type:infra']);
    expect(captured.errors).toEqual(['Nothing was created. Re-run with --confirm to create it.']);
  });

  it('lists the issues a new issue waits on in the preview of what it creates on GitHub', async () => {
    await writeFile(join(home, 'spec.md'), SPEC_FILE);
    expect(await runCli(['issue', 'create', 'spec.md', '--blocked-by', '12,14'], context())).toBe(5);
    expect(captured.lines.slice(0, 4)).toEqual(['This creates an issue on GitHub acme/widgets:', 'Title: Serve the domain from the UI', 'Labels: factory, type:infra', 'Blocked by: #12, #14']);
  });

  it('refuses a spec file that already carries the validated label', async () => {
    await writeFile(join(home, 'spec.md'), SPEC_FILE.replace('Labels: type:infra', 'Labels: type:infra, spec:validated'));
    expect(await runCli(['issue', 'create', join(home, 'spec.md'), '--confirm'], context())).toBe(1);
    expect(captured.errors[0]).toContain('only the operator adds that label');
  });

  it("stores a request with its images under the project's directory", async () => {
    await mkdir(join(home, 'shots'));
    await writeFile(join(home, 'shots', 'header.png'), 'png');
    await writeFile(join(home, 'ask.md'), '# Link mockups to conversations\nOperators get lost.\n');
    expect(await runCli(['request', 'add', 'ask.md', '--images', 'shots', '--requester', 'Dana'], context())).toBe(0);
    const directory = `${home}/projects/widgets/requests/req-1`;
    expect(captured.lines).toEqual([`Request req-1 of widgets stored with 1 image(s) in ${directory}`, 'Challenge it with "agent-factory request challenge req-1"']);
    expect(await readFile(join(directory, 'images', 'header.png'), 'utf8')).toBe('png');
    expect(await readFile(join(directory, 'request.md'), 'utf8')).toContain('Operators get lost.');
  });

  it('refuses to drive an issue while another factory process holds the lock', async () => {
    await mkdir(config.directories.state, { recursive: true });
    await writeFile(join(config.directories.state, 'factory.lock'), `${process.ppid}\n`);
    expect(await runCli(['run-issue', '7'], context())).toBe(1);
    expect(captured.errors[0]).toBe(`Factory process ${process.ppid} is running and holds ${config.directories.state}/factory.lock; wait for it to finish or stop it first`);
  });

  it('asks the running factory to stop once its running work finishes, and says when none runs', async () => {
    expect(await runCli(['stop'], context())).toBe(1);
    expect(captured.errors.at(-1)).toBe(`No factory runs on the installation at ${home}`);
    await mkdir(config.directories.state, { recursive: true });
    await writeFile(join(config.directories.state, 'factory.lock'), `${process.ppid}\n`);
    expect(await runCli(['stop'], context({ environment: { AGENT_FACTORY_HOME: home, USER: 'alex' } }))).toBe(0);
    expect(captured.lines.at(-1)).toBe(`The factory (process ${process.ppid}) takes no new work and stops once its running work finishes`);
    const eventLog = openEventLog(config.directories.state);
    try {
      expect((await activePauses(eventLog.events)).get('drain')?.reason).toBe('alex asked the factory to stop once its running work finishes');
    } finally {
      eventLog.close();
    }
  });

  it('prints the JSON Schema of the configuration', async () => {
    expect(await runCli(['schema'], context())).toBe(0);
    const schema = JSON.parse(captured.lines.join('\n')) as { readonly $id: string; readonly title: string };
    expect(schema.title).toBe('Agent Factory configuration');
    expect(schema.$id).toMatch(/schema\/config\.schema\.json$/);
  });
  describe('connected tools', () => {
    const TOOLS = [
      '    conventions: { defaultScope: repo }',
      '    tools:',
      '      - name: catalog',
      '        check: [/bin/sh, -c, test -f "$AGENT_FACTORY_HOME/catalog-session"]',
      '        fix: catalog login',
      '        login: touch "$AGENT_FACTORY_HOME/catalog-session"',
    ].join('\n');

    beforeEach(() => {
      config = parseConfig(configText().replace('    conventions: { defaultScope: repo }', TOOLS), home);
    });

    function withInstallation(): CliContext {
      const silent = { info: () => undefined, warn: () => undefined };
      return context({ openInstallation: (loaded, extra = {}) => openInstallation(loaded, { AGENT_FACTORY_HOME: home }, { userHome: home, log: silent, ...extra }) });
    }

    it('checks a tool a project declares without being told which project, and says how to fix it', async () => {
      expect(await runCli(['tool', 'check', 'catalog'], withInstallation())).toBe(1);
      expect(captured.lines.at(-1)).toMatch(/^catalog: unauthenticated: .*; to fix: catalog login$/);
    });

    it('starts the login the tool declares, without a terminal, then checks the tool again', async () => {
      expect(await runCli(['tool', 'login', 'catalog'], withInstallation())).toBe(0);
      expect(captured.lines.slice(-2)).toEqual([expect.stringMatching(/^catalog: login succeeded \(exit code 0 after \d+ s\)$/), expect.stringMatching(/^catalog: connected/)]);
      expect(await runCli(['tool', 'check', 'catalog'], withInstallation())).toBe(0);
    });

    it('refuses a tool nobody declares, and a login a tool does not declare', async () => {
      expect(await runCli(['tool', 'login', 'nope'], context())).toBe(1);
      expect(captured.errors.at(-1)).toBe('no tool named nope is declared by the installation or any project');
      expect(await runCli(['tool', 'login', 'git'], withInstallation())).toBe(1);
      expect(captured.errors.at(-1)).toContain('git declares no login the factory can start');
    });
  });
});

describe('the factory home of the default context', () => {
  let home: string;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-home-')));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('reads the configuration of AGENT_FACTORY_HOME and never falls back to the default home', async () => {
    const captured = capturedOutput();
    const output = { line: (text: string) => captured.lines.push(text), error: (text: string) => captured.errors.push(text) };
    await expect(defaultCliContext({ AGENT_FACTORY_HOME: home }, output).loadConfig()).rejects.toThrow(new ConfigMissingError(join(home, 'config.yaml')).message);
    await writeFile(join(home, 'config.yaml'), configText());
    const loaded = await defaultCliContext({ AGENT_FACTORY_HOME: home }, output).loadConfig();
    expect(loaded.home).toBe(home);
    expect(loaded.configPath).toBe(join(home, 'config.yaml'));
    expect(loaded.projects.map((project) => project.id)).toEqual(['widgets']);
  });
});
