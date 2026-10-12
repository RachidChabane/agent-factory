import {
  type LocalGateChecks,
  buildGhEnvironment,
  buildGitEnvironment,
  GhCliGateway,
  GitHubFileLinks,
  gitHubRepositoryUrl,
  localOnlyGitEnvironment,
  LocalGitHubGateway,
  RemoteLocalityGuard,
} from '@agent-factory/adapters';
import type { Clock, CommandRunner, ForgeFileLinks, GitHubGateway } from '@agent-factory/application';
import { repositoryFilePath } from '@agent-factory/cockpit';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import type { SourceEnvironment } from './project-settings.ts';

const TRAILING_SLASHES = /\/+$/;

/** Links to the files of a local forge's commits, which the factory's own server reads from the project's clone. */
export class LocalForgeFileLinks implements ForgeFileLinks {
  private readonly origin: string;
  private readonly project: string;

  constructor(publicUrl: string, project: string) {
    this.origin = publicUrl.replace(TRAILING_SLASHES, '');
    this.project = project;
  }

  file(sha: string, path: string): string {
    return `${this.origin}${repositoryFilePath(this.project, sha, path)}`;
  }

  rawFile(sha: string, path: string): string {
    return this.file(sha, path);
  }
}

/** Where the links of a project's pull request bodies lead: its GitHub repository, or the factory's server for a local forge. */
export function forgeFileLinks(project: ProjectConfig, publicUrl: string): ForgeFileLinks {
  return project.forge.kind === 'github' ? new GitHubFileLinks(project.repository) : new LocalForgeFileLinks(publicUrl, project.id);
}

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
  return project.forge.kind === 'github' ? gitHubRepositoryUrl(project.repository) : null;
}

export async function openForge(project: ProjectConfig, runner: CommandRunner, environment: SourceEnvironment, clock: Clock, gateChecks: LocalGateChecks | null = null): Promise<GitHubGateway> {
  const { forge } = project;
  switch (forge.kind) {
    case 'github':
      return new GhCliGateway(runner, {
        owner: project.repository.owner,
        repository: project.repository.name,
        baseBranch: project.baseBranch,
        environment: buildGhEnvironment(environment),
        mergeWithBypass: forge.mergeWithBypass,
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
          gateChecks,
        },
        clock,
      );
    }
  }
}
