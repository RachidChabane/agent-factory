import { join } from 'node:path';
import { GitBaseCheckouts } from '@agent-factory/adapters';
import type { CommandRunner } from '@agent-factory/application';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';

export const BASE_WORKSPACES_DIRECTORY = 'base-workspaces';

/** Clean checkouts of the base branch, beside the worktree pool, where checks are proven to fail and the gate is rehearsed. */
export function baseWorkspaces(project: ProjectConfig, runner: CommandRunner, gitEnvironment: Readonly<Record<string, string>>): GitBaseCheckouts {
  return new GitBaseCheckouts(runner, {
    targetClonePath: project.clonePath,
    checkoutsDirectory: join(project.worktreePool.directory, BASE_WORKSPACES_DIRECTORY),
    baseBranch: project.baseBranch,
    environment: gitEnvironment,
  });
}
