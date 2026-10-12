import {
  buildGhEnvironment,
  buildGitEnvironment,
  GhCliGateway,
  localOnlyGitEnvironment,
  LocalGitHubGateway,
  RemoteLocalityGuard,
} from '@agent-factory/adapters';
import type { Clock, CommandRunner, GitHubGateway } from '@agent-factory/application';
import type { FactoryConfig } from '../config/factory-config.ts';
import type { SourceEnvironment } from './factory-container.ts';

export function factoryGitEnvironment(config: FactoryConfig, environment: SourceEnvironment): Readonly<Record<string, string>> {
  const gitEnvironment = buildGitEnvironment(environment);
  return config.github.mode === 'local' ? localOnlyGitEnvironment(gitEnvironment) : gitEnvironment;
}

export function rehearsalRepositories(config: FactoryConfig): readonly string[] {
  return [config.target.clonePath, config.github.local.bareRepositoryPath];
}

export function agentProtectedDirectories(config: FactoryConfig): readonly string[] {
  return config.github.mode === 'local' ? [config.github.local.directory] : [];
}

export async function openGitHubGateway(
  config: FactoryConfig,
  runner: CommandRunner,
  environment: SourceEnvironment,
  clock: Clock,
): Promise<GitHubGateway> {
  switch (config.github.mode) {
    case 'remote':
      return new GhCliGateway(runner, {
        owner: config.target.owner,
        repository: config.target.name,
        baseBranch: config.target.baseBranch,
        environment: buildGhEnvironment(environment),
      });
    case 'local': {
      const gitEnvironment = factoryGitEnvironment(config, environment);
      await new RemoteLocalityGuard(runner, gitEnvironment).assertLocalOnly(rehearsalRepositories(config));
      return new LocalGitHubGateway(
        runner,
        {
          directory: config.github.local.directory,
          bareRepositoryPath: config.github.local.bareRepositoryPath,
          baseBranch: config.target.baseBranch,
          checks: config.github.local.checks,
          identity: config.github.commitIdentity,
          environment: gitEnvironment,
        },
        clock,
      );
    }
  }
}
