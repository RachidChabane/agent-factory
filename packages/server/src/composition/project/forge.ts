import {
  buildGhEnvironment,
  buildGitEnvironment,
  GhCliGateway,
  localOnlyGitEnvironment,
  LocalGitHubGateway,
  RemoteLocalityGuard,
} from '@agent-factory/adapters';
import type { Clock, CommandRunner, GitHubGateway } from '@agent-factory/application';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import type { SourceEnvironment } from './project-settings.ts';

const GITHUB_WEB_ORIGIN = 'https://github.com';

/** Git's environment for a project; a local forge's project never reaches a remote. */
export function projectGitEnvironment(project: ProjectConfig, environment: SourceEnvironment): Readonly<Record<string, string>> {
  const gitEnvironment = buildGitEnvironment(environment);
  return project.forge.kind === 'local' ? localOnlyGitEnvironment(gitEnvironment) : gitEnvironment;
}

/** The repositories a local forge's project works in, which must have no remote outside the machine. */
export function rehearsalRepositories(project: ProjectConfig): readonly string[] {
  return project.forge.kind === 'local' ? [project.clonePath, project.forge.bareRepositoryPath] : [];
}

/** The web page of the project's repository, or null for a local forge. */
export function forgeUrl(project: ProjectConfig): string | null {
  return project.forge.kind === 'github' ? `${GITHUB_WEB_ORIGIN}/${project.repository.owner}/${project.repository.name}` : null;
}

export async function openForge(project: ProjectConfig, runner: CommandRunner, environment: SourceEnvironment, clock: Clock): Promise<GitHubGateway> {
  const { forge } = project;
  switch (forge.kind) {
    case 'github':
      return new GhCliGateway(runner, {
        owner: project.repository.owner,
        repository: project.repository.name,
        baseBranch: project.baseBranch,
        environment: buildGhEnvironment(environment),
      });
    case 'local': {
      const gitEnvironment = projectGitEnvironment(project, environment);
      await new RemoteLocalityGuard(runner, gitEnvironment).assertLocalOnly(rehearsalRepositories(project));
      return new LocalGitHubGateway(
        runner,
        {
          directory: forge.directory,
          bareRepositoryPath: forge.bareRepositoryPath,
          baseBranch: project.baseBranch,
          checks: forge.checks,
          identity: project.commitIdentity,
          environment: gitEnvironment,
        },
        clock,
      );
    }
  }
}
