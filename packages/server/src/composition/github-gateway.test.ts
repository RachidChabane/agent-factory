import { describe, expect, it } from 'vitest';
import { GhCliGateway, RepositoryMissingError } from '@agent-factory/adapters';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { parseFactoryConfig } from '../config/factory-config.ts';
import { agentProtectedDirectories, factoryGitEnvironment, openGitHubGateway } from './github-gateway.ts';

const HOME = '/nonexistent/factory-home';
const CONFIG_TEXT = `
target: { owner: acme, name: widgets, clonePath: clone }
roles:
  acceptance-author: { model: sonnet, effort: medium, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
  implementer: { model: sonnet, effort: high, maxBudgetUsd: 2, maxTurns: 20, timeoutMinutes: 10, escalation: { model: opus, effort: max } }
  reviewer: { model: sonnet, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
gate: {}
conventionalCommits: { defaultScope: main }
github: { commitIdentity: { name: Bot, email: bot@example.invalid } }
`;
const LOCAL_TEXT = CONFIG_TEXT.replace('github: {', 'github: { mode: local,');
const CLOCK = { now: (): Date => new Date(0) };

class RefusingRunner implements CommandRunner {
  readonly commands: string[] = [];

  run(command: readonly string[]): Promise<CommandResult> {
    this.commands.push(command.join(' '));
    return Promise.reject(new Error('no command may run'));
  }
}

function config(text: string): ReturnType<typeof parseFactoryConfig> {
  return parseFactoryConfig(text, HOME, `${HOME}/config.yaml`, '/nonexistent');
}

describe('openGitHubGateway', () => {
  it('talks to GitHub through gh by default without inspecting the clone', async () => {
    const runner = new RefusingRunner();
    expect(await openGitHubGateway(config(CONFIG_TEXT), runner, { PATH: '/bin' }, CLOCK)).toBeInstanceOf(GhCliGateway);
    expect(runner.commands).toEqual([]);
    expect(factoryGitEnvironment(config(CONFIG_TEXT), { PATH: '/bin' })).not.toHaveProperty('GIT_ALLOW_PROTOCOL');
    expect(agentProtectedDirectories(config(CONFIG_TEXT))).toEqual([]);
  });

  it('refuses the local mode until the rehearsal repositories exist, and confines git to local transports', async () => {
    await expect(openGitHubGateway(config(LOCAL_TEXT), new RefusingRunner(), { PATH: '/bin' }, CLOCK)).rejects.toBeInstanceOf(
      RepositoryMissingError,
    );
    expect(factoryGitEnvironment(config(LOCAL_TEXT), { PATH: '/bin' })).toMatchObject({ GIT_ALLOW_PROTOCOL: 'file' });
    expect(agentProtectedDirectories(config(LOCAL_TEXT))).toEqual([`${HOME}/github`]);
  });
});
