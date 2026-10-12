import { AGENT_ROLES } from '@agent-factory/domain';
import { POLICY_ARGUMENT } from '@agent-factory/plugin';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from './role-permissions.ts';
import {
  FROZEN_WRITE_TOOLS_MATCHER,
  PROJECT_SETTINGS_FILES,
  STOP_HOOK_TIMEOUT_MARGIN_SECONDS,
  renderRunSettings,
  shellQuote,
  type RunSettingsInput,
} from './run-settings.ts';

const WORKTREE = '/factory/worktrees/issue-42';
const RUNS_ROOT = '/factory/runs';
const INSTALL_DIRECTORY = '/opt/agent-factory';
const POLICY_PATH = `${RUNS_ROOT}/run-1/gate-policy.json`;

function input(overrides: Partial<RunSettingsInput> = {}): RunSettingsInput {
  return {
    role: 'implementer',
    extraAllowedTools: [],
    worktree: WORKTREE,
    frozenCheckPaths: ['test/acceptance/sum.test.ts'],
    protectedDirectories: [RUNS_ROOT, INSTALL_DIRECTORY],
    hookRuntime: '/opt/node/bin/node',
    hookScripts: {
      stopGate: `${INSTALL_DIRECTORY}/packages/plugin/hooks/stop-gate.ts`,
      frozenWriteGuard: `${INSTALL_DIRECTORY}/packages/plugin/hooks/frozen-write-guard.ts`,
    },
    policyPath: POLICY_PATH,
    gateRequired: true,
    gateTimeoutMs: 600_000,
    sandboxAllowedDomains: [],
    writableDirectories: [],
    deniedReadPaths: [],
    readablePaths: [],
    shellCommands: [],
    unixSockets: [],
    socketsAllOrNothing: false,
    ...overrides,
  };
}

describe('renderRunSettings', () => {
  it('gives the implementer file tools and a restricted Bash allowlist', () => {
    const { settings, availableTools } = renderRunSettings(input());
    expect(settings.permissions.allow).toEqual(
      expect.arrayContaining([
        'Read',
        'Edit',
        'Write',
        'Glob',
        'Grep',
        'Bash(npm run *)',
        'Bash(npx vitest *)',
        'Bash(mise run *)',
        'Bash(uv run *)',
        'Bash(git status*)',
        'Bash(git diff*)',
      ]),
    );
    expect(settings.permissions.allow).not.toContain('Bash');
    expect(settings.permissions.allow).not.toContain('Bash(git commit *)');
    expect(availableTools).toEqual(['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash']);
  });

  it('denies outward actions to every role', () => {
    for (const role of AGENT_ROLES) {
      const { settings } = renderRunSettings(input({ role }));
      expect(settings.permissions.deny).toEqual(
        expect.arrayContaining(['Bash(git push*)', 'Bash(gh *)', 'Bash(curl *)', 'Bash(rm -rf*)', 'WebFetch']),
      );
    }
  });

  it('keeps reviewers and auditors read-only', () => {
    for (const role of ['reviewer', 'auditor', 'release-auditor'] as const) {
      const { settings, availableTools } = renderRunSettings(input({ role }));
      expect(settings.permissions.allow).toEqual(['Read', 'Glob', 'Grep']);
      expect(availableTools).toEqual(['Read', 'Glob', 'Grep']);
    }
  });

  it('covers every role with a permission set', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...AGENT_ROLES].sort());
  });

  it('denies reading and editing the runs directory and the factory install with absolute rules', () => {
    const { settings } = renderRunSettings(input());
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining([
        `Read(/${RUNS_ROOT}/**)`,
        `Edit(/${RUNS_ROOT}/**)`,
        `Read(/${INSTALL_DIRECTORY}/**)`,
        `Edit(/${INSTALL_DIRECTORY}/**)`,
      ]),
    );
    expect(settings.permissions.deny).toContain('Read(//factory/runs/**)');
    expect(settings.sandbox.filesystem.denyRead).toEqual([RUNS_ROOT, INSTALL_DIRECTORY]);
  });

  it('denies edits of frozen checks in permissions and in the sandbox', () => {
    const { settings } = renderRunSettings(input());
    expect(settings.permissions.deny).toContain(`Edit(/${WORKTREE}/test/acceptance/sum.test.ts)`);
    expect(settings.sandbox.filesystem.denyWrite).toContain(`${WORKTREE}/test/acceptance/sum.test.ts`);
  });

  it('keeps the project settings Claude Code loads out of reach of the agent', () => {
    const { settings } = renderRunSettings(input());
    for (const file of PROJECT_SETTINGS_FILES) {
      expect(settings.permissions.deny).toContain(`Edit(/${WORKTREE}/${file})`);
      expect(settings.sandbox.filesystem.denyWrite).toContain(`${WORKTREE}/${file}`);
    }
  });

  it('lets sandboxed commands write only the configured tool directories beyond the worktree', () => {
    expect(renderRunSettings(input()).settings.sandbox.filesystem.allowWrite).toEqual([]);
    const { settings } = renderRunSettings(input({ writableDirectories: ['/factory/cache'] }));
    expect(settings.sandbox.filesystem.allowWrite).toEqual(['/factory/cache']);
  });

  it('runs Bash in a sandbox that cannot be bypassed or auto-approved', () => {
    const { settings } = renderRunSettings(input({ sandboxAllowedDomains: ['registry.npmjs.org'] }));
    expect(settings.sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      network: { allowedDomains: ['registry.npmjs.org'] },
    });
  });

  it('guards frozen checks before writes and runs the gate on stop', () => {
    const { settings } = renderRunSettings(input());
    const preToolUse = settings.hooks.PreToolUse?.[0];
    const stop = settings.hooks.Stop?.[0]?.hooks[0];
    expect(preToolUse?.matcher).toBe(FROZEN_WRITE_TOOLS_MATCHER);
    expect(preToolUse?.hooks[0]?.command).toBe(
      `'/opt/node/bin/node' '${INSTALL_DIRECTORY}/packages/plugin/hooks/frozen-write-guard.ts' ${POLICY_ARGUMENT} '${POLICY_PATH}'`,
    );
    expect(stop?.command).toBe(
      `'/opt/node/bin/node' '${INSTALL_DIRECTORY}/packages/plugin/hooks/stop-gate.ts' ${POLICY_ARGUMENT} '${POLICY_PATH}'`,
    );
    expect(stop?.timeout).toBe(600 + STOP_HOOK_TIMEOUT_MARGIN_SECONDS);
  });

  it('renders no hooks when there is neither a gate nor a frozen check', () => {
    const { settings } = renderRunSettings(input({ gateRequired: false, frozenCheckPaths: [] }));
    expect(settings.hooks).toEqual({});
  });

  it('adds request-specific tools to both the allowlist and the available tools', () => {
    const { allowedTools, availableTools } = renderRunSettings(
      input({ role: 'reviewer', extraAllowedTools: ['Bash(printenv GH_TOKEN)', 'mcp__figma__get_file'] }),
    );
    expect(allowedTools).toEqual(['Read', 'Glob', 'Grep', 'Bash(printenv GH_TOKEN)', 'mcp__figma__get_file']);
    expect(availableTools).toEqual(['Read', 'Glob', 'Grep', 'Bash']);
  });
});

describe('credential read denies', () => {
  const CREDENTIALS = ['/Users/operator/.ssh', '/Users/operator/.netrc', '/Users/operator/Library/Keychains'];

  it('denies the agent file tools and its sandboxed commands every credential path', () => {
    const { settings } = renderRunSettings(input({ deniedReadPaths: CREDENTIALS }));
    for (const path of CREDENTIALS) {
      expect(settings.permissions.deny).toContain(`Read(/${path})`);
      expect(settings.permissions.deny).toContain(`Read(/${path}/**)`);
      expect(settings.sandbox.filesystem.denyRead).toContain(path);
    }
    expect(settings.sandbox.filesystem.denyRead).toEqual([RUNS_ROOT, INSTALL_DIRECTORY, ...CREDENTIALS]);
  });

  it('re-opens only the shell snapshots the Bash tool sources', () => {
    const snapshots = '/Users/operator/.claude/shell-snapshots';
    const { settings } = renderRunSettings(input({ deniedReadPaths: ['/Users/operator/.claude'], readablePaths: [snapshots] }));
    expect(settings.sandbox.filesystem.allowRead).toEqual([snapshots]);
  });

  it('lets the writing roles run the shell commands the project declares, and only them', () => {
    const shellCommands = ['go test *', 'docker *'];
    for (const role of AGENT_ROLES) {
      const { allowedTools } = renderRunSettings(input({ role, shellCommands }));
      const expected = ROLE_PERMISSIONS[role].runsProjectCommands;
      expect(allowedTools.includes('Bash(go test *)'), role).toBe(expected);
      expect(allowedTools.includes('Bash(docker *)'), role).toBe(expected);
    }
  });

  it('opens no Unix socket unless the project grants one', () => {
    const { network } = renderRunSettings(input()).settings.sandbox;
    expect(network).toEqual({ allowedDomains: [] });
  });

  it('opens the granted engine socket to the shell and lets it through the denied directory that holds it', () => {
    const socket = '/Users/operator/.docker/run/docker.sock';
    const { settings } = renderRunSettings(input({ deniedReadPaths: ['/Users/operator/.docker'], unixSockets: [socket], sandboxAllowedDomains: ['registry.example.com'] }));
    expect(settings.sandbox.network).toEqual({ allowedDomains: ['registry.example.com'], allowUnixSockets: [socket] });
    expect(settings.sandbox.filesystem.allowRead).toEqual([socket]);
    expect(settings.sandbox.filesystem.denyRead).toContain('/Users/operator/.docker');
  });

  it('opens every Unix socket where the sandbox cannot tell one from another', () => {
    const { network } = renderRunSettings(input({ unixSockets: ['/run/docker.sock'], socketsAllOrNothing: true })).settings.sandbox;
    expect(network).toEqual({ allowedDomains: [], allowUnixSockets: ['/run/docker.sock'], allowAllUnixSockets: true });
  });

  it('denies the keychain command to every role', () => {
    for (const role of AGENT_ROLES) expect(renderRunSettings(input({ role })).settings.permissions.deny).toContain('Bash(security *)');
  });
});

describe('shellQuote', () => {
  it('quotes paths containing spaces and single quotes', () => {
    expect(shellQuote("/tmp/it's here")).toBe(`'/tmp/it'\\''s here'`);
  });
});
