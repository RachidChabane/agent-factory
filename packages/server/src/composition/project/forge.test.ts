import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { GhCliGateway, RepositoryMissingError } from '@agent-factory/adapters';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { parseAgentFactoryConfig, projectOf } from '../../config/agent-factory-config.ts';
import { forgeUrl, openForge, projectGitEnvironment, rehearsalRepositories } from './forge.ts';

const HOME = '/nonexistent/factory-home';
const CLOCK = { now: (): Date => new Date(0) };

class RefusingRunner implements CommandRunner {
  readonly commands: string[] = [];

  run(command: readonly string[]): Promise<CommandResult> {
    this.commands.push(command.join(' '));
    return Promise.reject(new Error('no command may run'));
  }
}

const config = parseAgentFactoryConfig(
  stringify({
    version: 1,
    projects: [
      { id: 'storefront', name: 'Storefront', forge: { kind: 'github', repository: 'example-org/storefront' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' } },
      { id: 'ledger', name: 'Ledger', forge: { kind: 'local', repository: 'example-org/ledger' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' } },
    ],
  }),
  HOME,
  `${HOME}/config.yaml`,
  '/nonexistent',
);

describe('the forge of a project', () => {
  it('talks to GitHub through gh without inspecting the clone', async () => {
    const runner = new RefusingRunner();
    const storefront = projectOf(config, 'storefront');
    expect(await openForge(storefront, runner, { PATH: '/bin' }, CLOCK)).toBeInstanceOf(GhCliGateway);
    expect(runner.commands).toEqual([]);
    expect(projectGitEnvironment(storefront, { PATH: '/bin' })).not.toHaveProperty('GIT_ALLOW_PROTOCOL');
    expect(rehearsalRepositories(storefront)).toEqual([]);
    expect(forgeUrl(storefront)).toBe('https://github.com/example-org/storefront');
  });

  it('refuses a local forge until its repositories exist, and confines git to local transports', async () => {
    const ledger = projectOf(config, 'ledger');
    await expect(openForge(ledger, new RefusingRunner(), { PATH: '/bin' }, CLOCK)).rejects.toBeInstanceOf(RepositoryMissingError);
    expect(projectGitEnvironment(ledger, { PATH: '/bin' })).toMatchObject({ GIT_ALLOW_PROTOCOL: 'file' });
    expect(rehearsalRepositories(ledger)).toEqual([`${HOME}/projects/ledger/clone`, `${HOME}/projects/ledger/forge/ledger.git`]);
    expect(forgeUrl(ledger)).toBeNull();
  });
});
