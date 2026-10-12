import { describe, expect, it } from 'vitest';
import { CHILD_VARIABLES, INHERITED_VARIABLES, buildChildEnvironment, credentialVariablesIn } from './child-environment.ts';

const OPERATOR_ENVIRONMENT = {
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/Users/operator',
  LANG: 'en_US.UTF-8',
  TERM: 'xterm-256color',
  TMPDIR: '/var/folders/tmp/',
  USER: 'operator',
  MISE_DATA_DIR: '/Users/operator/tools',
  MISE_CONFIG_DIR: '/Users/operator/.config/mise',
  MISE_CACHE_DIR: '/Users/operator/.cache/mise',
  MISE_STATE_DIR: '/Users/operator/.local/state/mise',
  RUSTUP_HOME: '/Users/operator/tools/rustup',
  CARGO_HOME: '/Users/operator/tools/cargo',
  SHELL: '/bin/zsh',
  GH_TOKEN: 'ghp_secret',
  GITHUB_TOKEN: 'ghs_secret',
  SSH_AUTH_SOCK: '/private/tmp/agent.sock',
  AWS_SECRET_ACCESS_KEY: 'aws',
  GOOGLE_CLOUD_PROJECT: 'project',
  DD_API_KEY: 'datadog',
  VAULT_ADDR: 'https://vault.example',
  VAULT_TOKEN: 'vault',
  AIVEN_TOKEN: 'aiven',
  KCP_PROD_APIKEY: 'kafka',
  NUXT_OIDC_SESSION_SECRET: 'oidc',
  ANTHROPIC_API_KEY: 'sk-ant',
  CLAUDECODE: '1',
  CLAUDE_CODE_SESSION_ID: 'parent-session',
  CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/socket',
  ORCA_AGENT_HOOK_TOKEN: 'orca',
  NODE_OPTIONS: '--require /tmp/inject.js',
  UNSET_VALUE: undefined,
};

const OPTIONS = {
  githubConfigDirectory: '/runs/run-1/gh-config',
  claudeConfigDirectory: null,
  maxSubagentSpawnDepth: 1,
  maxConcurrentSubagents: 2,
  stopHookBlockCap: 2,
};

describe('buildChildEnvironment', () => {
  const environment = buildChildEnvironment(OPERATOR_ENVIRONMENT, OPTIONS);

  it('passes only the allowlisted operator variables', () => {
    const inherited = Object.keys(environment).filter((name) => !Object.values(CHILD_VARIABLES).some((child) => child === name));
    expect(inherited.sort()).toEqual([...INHERITED_VARIABLES].sort());
    expect(environment['USER']).toBe('operator');
  });

  it('never passes credentials, parent session markers or injection hooks', () => {
    for (const name of [
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'SSH_AUTH_SOCK',
      'AWS_SECRET_ACCESS_KEY',
      'GOOGLE_CLOUD_PROJECT',
      'DD_API_KEY',
      'VAULT_ADDR',
      'VAULT_TOKEN',
      'AIVEN_TOKEN',
      'KCP_PROD_APIKEY',
      'NUXT_OIDC_SESSION_SECRET',
      'ANTHROPIC_API_KEY',
      'CLAUDECODE',
      'CLAUDE_CODE_SESSION_ID',
      'CLAUDE_CODE_MESSAGING_SOCKET',
      'ORCA_AGENT_HOOK_TOKEN',
      'NODE_OPTIONS',
      'SHELL',
    ]) {
      expect(environment).not.toHaveProperty(name);
    }
    expect(credentialVariablesIn(environment)).toEqual([]);
  });

  it('adds the tool environment the gate uses', () => {
    const withTools = buildChildEnvironment(OPERATOR_ENVIRONMENT, { ...OPTIONS, toolEnvironment: { UV_CACHE_DIR: '/factory/cache/uv' } });
    expect(withTools['UV_CACHE_DIR']).toBe('/factory/cache/uv');
    expect(credentialVariablesIn(withTools)).toEqual([]);
  });

  it('uses the default Claude login when no account is selected', () => {
    expect(environment).not.toHaveProperty(CHILD_VARIABLES.claudeConfigDirectory);
  });

  it('points claude at the configuration directory of the selected account', () => {
    const selected = buildChildEnvironment(
      { ...OPERATOR_ENVIRONMENT, CLAUDE_CONFIG_DIR: '/Users/operator/.claude-operator' },
      { ...OPTIONS, claudeConfigDirectory: '/Users/operator/.claude-second' },
    );
    expect(selected[CHILD_VARIABLES.claudeConfigDirectory]).toBe('/Users/operator/.claude-second');
    expect(credentialVariablesIn(selected)).toEqual([]);
  });

  it('never inherits the operator configuration directory', () => {
    const inherited = buildChildEnvironment({ ...OPERATOR_ENVIRONMENT, CLAUDE_CONFIG_DIR: '/Users/operator/.claude-operator' }, OPTIONS);
    expect(inherited).not.toHaveProperty(CHILD_VARIABLES.claudeConfigDirectory);
  });

  it('points gh at an empty per-run configuration directory', () => {
    expect(environment[CHILD_VARIABLES.githubConfigDirectory]).toBe(OPTIONS.githubConfigDirectory);
  });

  it('caps subagents and in-session corrections from configuration', () => {
    expect(environment[CHILD_VARIABLES.maxSubagentSpawnDepth]).toBe('1');
    expect(environment[CHILD_VARIABLES.maxConcurrentSubagents]).toBe('2');
    expect(environment[CHILD_VARIABLES.stopHookBlockCap]).toBe('2');
  });

  it('disables auto memory and self-updates so runs stay reproducible', () => {
    expect(environment[CHILD_VARIABLES.disableAutoMemory]).toBe('1');
    expect(environment[CHILD_VARIABLES.disableAutoUpdater]).toBe('1');
  });

  it('omits allowlisted variables the operator does not define', () => {
    const minimal = buildChildEnvironment({ PATH: '/bin' }, OPTIONS);
    expect(minimal).not.toHaveProperty('HOME');
    expect(minimal['PATH']).toBe('/bin');
  });
});

describe('credentialVariablesIn', () => {
  it('flags credential-shaped variables', () => {
    expect(credentialVariablesIn({ GH_TOKEN: 'x', PATH: '/bin', VAULT_TOKEN: 'y' })).toEqual(['GH_TOKEN', 'VAULT_TOKEN']);
  });

  it('keeps the toolchain locations so tools resolve to the operator installation', () => {
    const environment = buildChildEnvironment(
      { PATH: '/bin', MISE_DATA_DIR: '/tools', RUSTUP_HOME: '/tools/rustup', CARGO_HOME: '/tools/cargo' },
      { githubConfigDirectory: '/empty', claudeConfigDirectory: null, maxSubagentSpawnDepth: 1, maxConcurrentSubagents: 1, stopHookBlockCap: 2 },
    );
    expect(environment['MISE_DATA_DIR']).toBe('/tools');
    expect(environment['RUSTUP_HOME']).toBe('/tools/rustup');
    expect(environment['CARGO_HOME']).toBe('/tools/cargo');
  });
});
