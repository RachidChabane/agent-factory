import { join } from 'node:path';
import { GitBaseCheckouts } from '@agent-factory/adapters';
import type { CommandRunner } from '@agent-factory/application';
import type { FactoryConfig } from '../config/factory-config.ts';
import type { SourceEnvironment } from './factory-container.ts';
import { factoryGitEnvironment } from './github-gateway.ts';

export const BASE_WORKSPACES_DIRECTORY = 'base-workspaces';

export function baseWorkspacesDirectory(config: FactoryConfig): string {
  return join(config.worktreePool.directory, BASE_WORKSPACES_DIRECTORY);
}

export function baseWorkspaces(config: FactoryConfig, environment: SourceEnvironment, runner: CommandRunner): GitBaseCheckouts {
  return new GitBaseCheckouts(runner, {
    targetClonePath: config.target.clonePath,
    checkoutsDirectory: baseWorkspacesDirectory(config),
    baseBranch: config.target.baseBranch,
    environment: factoryGitEnvironment(config, environment),
  });
}
