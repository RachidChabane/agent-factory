import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import type { CommandSandbox } from '../ports.ts';
import { DEFAULT_ISSUE_TYPES } from '@agent-factory/domain';
import { composeGateCommand, InvalidVariableNameError, OrchestratorGate } from './gate-runner.ts';
import { STACK_SLOT_VARIABLE, StackStartError } from './issue-stack.ts';
import type { GateSettings } from './pipeline-settings.ts';
import { ShellCommands } from './shell-commands.ts';
import { InMemorySourceControl, InMemoryWorkspace, RecordingSandbox, ScriptedCommandRunner } from './testing/pipeline-fakes.ts';

const WORKTREE = '/pool/slot-1';

const MANIFEST: AcceptanceManifest = {
  runner: 'vitest',
  checks: [{ criterion: 1, paths: ['test/a.test.ts'], description: 'a', onBase: 'fails' }],
  command: ['printf', '%s|%s', '$TRUSTED', "it's"],
  evidence: [],
  score: null,
};

const SETTINGS: GateSettings = {
  commandsBeforeAcceptance: [{ name: 'lint', run: 'test "$TRUSTED" = "/pool dir"' }],
  commandsAfterAcceptance: [],
  commandTimeoutMs: 1_000,
  environment: { TRUSTED: '/pool dir' },
  niceness: null,
};

const UNCONFINED: CommandSandbox = { confine: (command) => command };

describe('composeGateCommand', () => {
  it('runs the gate commands in the same environment as the orchestrator gate', () => {
    const command = composeGateCommand(SETTINGS, MANIFEST, UNCONFINED, WORKTREE);
    expect(command).toBe(
      "export TRUSTED='/pool dir'; (/bin/sh -c 'test \"$TRUSTED\" = \"/pool dir\"') && (/bin/sh -c 'printf '\\''%s|%s'\\'' '\\''$TRUSTED'\\'' '\\''it'\\''\\'\\'''\\''s'\\''')",
    );
    expect(execFileSync('/bin/sh', ['-c', command ?? ''], { env: {}, encoding: 'utf8' })).toBe("$TRUSTED|it's");
  });

  it('confines every step on its own, with network only for a step that declares it', () => {
    const sandbox = new RecordingSandbox();
    const settings: GateSettings = {
      ...SETTINGS,
      commandsAfterAcceptance: [{ name: 'audit', run: 'npm audit', network: { reason: 'queries the advisory database' } }],
    };
    const command = composeGateCommand(settings, MANIFEST, sandbox, WORKTREE);
    expect(sandbox.scopes).toEqual([
      { workingDirectory: WORKTREE, network: false, hostLoopback: false },
      { workingDirectory: WORKTREE, network: false, hostLoopback: false },
      { workingDirectory: WORKTREE, network: true, hostLoopback: false },
    ]);
    expect(command).toContain("(sandbox offline /bin/sh -c 'test");
    expect(command).toContain("(sandbox online /bin/sh -c 'npm audit')");
  });

  it('has no gate command when nothing is configured and no check exists', () => {
    expect(composeGateCommand({ ...SETTINGS, commandsBeforeAcceptance: [] }, { ...MANIFEST, checks: [], command: null }, UNCONFINED, WORKTREE)).toBeNull();
  });

  it('refuses a variable name the shell would misread', () => {
    expect(() => composeGateCommand({ ...SETTINGS, environment: { 'BAD NAME': 'x' } }, MANIFEST, UNCONFINED, WORKTREE)).toThrow(InvalidVariableNameError);
  });

  it('runs the steps inside a stack with its variables, on the host loopback', () => {
    const sandbox = new RecordingSandbox();
    const command = composeGateCommand(SETTINGS, MANIFEST, sandbox, WORKTREE, { shell: {} as ShellCommands, environment: { [STACK_SLOT_VARIABLE]: '1', BASE_URL: 'http://127.0.0.1:19877' } });
    const exports = command?.slice(0, command.indexOf('; (')) ?? '';
    expect(execFileSync('/bin/sh', ['-c', `${exports}; printf '%s %s %s' "$TRUSTED" "$AGENT_FACTORY_SLOT" "$BASE_URL"`], { env: {}, encoding: 'utf8' })).toBe('/pool dir 1 http://127.0.0.1:19877');
    expect(sandbox.scopes.every((scope) => scope.hostLoopback === true)).toBe(true);
  });
});

describe('the orchestrator gate', () => {
  it('fails on a stack that does not start, after the setup and before the commands that needed it', async () => {
    const workspace = new InMemoryWorkspace();
    const sourceControl = new InMemorySourceControl(workspace, new Map([['README.md', '# shop\n']]), () => false);
    const runner = new ScriptedCommandRunner().on('npm ci', () => ({ exitCode: 0 }));
    const shell = new ShellCommands(runner, new RecordingSandbox(), {}, 1_000, null);
    const gate = new OrchestratorGate(sourceControl, workspace, shell, SETTINGS, [{ name: 'install', run: 'npm ci' }]);
    const type = DEFAULT_ISSUE_TYPES[0];
    if (type === undefined) throw new Error('no preset issue type');
    const run = await gate.run({ path: WORKTREE, branch: 'factory/4-filter', baseSha: 'base' }, [], { ...MANIFEST, runner: null }, type, { scoreReport: null, tests: [] }, () =>
      Promise.reject(new StackStartError('web never answered')),
    );
    expect(run.result.passed).toBe(false);
    expect(run.result.steps.map((step) => [step.name, step.outcome])).toEqual([
      ['frozen-checks', 'passed'],
      ['install', 'passed'],
      ['stack', 'failed'],
      ['lint', 'skipped'],
      ['acceptance', 'skipped'],
    ]);
    expect(run.result.steps.find((step) => step.name === 'stack')?.detail).toBe('the stack did not start: web never answered');
  });
});
