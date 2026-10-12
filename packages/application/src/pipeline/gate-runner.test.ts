import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import type { CommandSandbox } from '../ports.ts';
import { composeGateCommand, InvalidVariableNameError } from './gate-runner.ts';
import type { GateSettings } from './pipeline-settings.ts';
import { RecordingSandbox } from './testing/pipeline-fakes.ts';

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
      { workingDirectory: WORKTREE, network: false },
      { workingDirectory: WORKTREE, network: false },
      { workingDirectory: WORKTREE, network: true },
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
});
