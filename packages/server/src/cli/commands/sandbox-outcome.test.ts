import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { sandboxOutcome } from './validation-checks.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;
const SOCKET = `${USER_HOME}/.docker/run/docker.sock`;

function projectWith(sandbox: Record<string, unknown>): ProjectConfig {
  const text = stringify({
    version: 1,
    projects: [{ id: 'ledger', name: 'Ledger', forge: { kind: 'local', repository: 'example-org/ledger' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, sandbox }],
  });
  return projectOf(parseAgentFactoryConfig(text, HOME, `${HOME}/config.yaml`, USER_HOME), 'ledger');
}

describe('the sandbox notice of validate', () => {
  it('says a project without grants stays fully confined', () => {
    expect(sandboxOutcome(projectWith({}), [SOCKET])).toEqual({ ok: true, detail: 'agents and commands stay confined: no container engine, no network domain for agents' });
  });

  it('names the hosts the agents reach', () => {
    expect(sandboxOutcome(projectWith({ allowedDomains: ['pypi.org', '*.pythonhosted.org'] }), [])).toEqual({ ok: true, detail: 'agents reach pypi.org, *.pythonhosted.org' });
  });

  it('spells out what a container engine grant gives up', () => {
    expect(sandboxOutcome(projectWith({ docker: true }), [SOCKET])).toEqual({
      ok: true,
      detail: `container engine granted at ${SOCKET}: a container can mount any directory the engine shares and reach any network, so what runs through the engine is not confined`,
    });
  });

  it('fails when the engine is granted but no engine listens', () => {
    expect(sandboxOutcome(projectWith({ docker: true }), [])).toEqual({ ok: false, detail: 'the container engine is granted but no engine socket was found: start the engine, or set DOCKER_HOST' });
  });

  it('refuses a domain that is not a host name and a command pattern that would break its rule', () => {
    expect(() => projectWith({ allowedDomains: ['https://pypi.org'] })).toThrow(/must be a host name/);
    expect(() => projectWith({ shellCommands: ['go test (all)'] })).toThrow(/without parentheses/);
  });
});
