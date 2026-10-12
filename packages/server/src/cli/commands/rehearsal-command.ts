import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { RehearsalRepositories, type RehearsalLayout } from '@agent-factory/adapters';
import { parseSpecFile, specFileProblems, withExtraLabels } from '@agent-factory/application';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import { openForge, projectGitEnvironment } from '../../composition/project/forge.ts';
import { projectConventions } from '../../composition/project/project-settings.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { itemName, selectedProject, type SelectedProject } from './project-session.ts';

const UTF8 = 'utf8';
const PARENT_SEGMENT = '..';
const LABEL_SEPARATOR = ', ';

type LocalForge = Extract<ProjectConfig['forge'], { readonly kind: 'local' }>;

export class LocalForgeRequiredError extends Error {
  constructor(project: ProjectConfig) {
    super(`Rehearsal commands work on a project whose forge is local; ${project.id} uses ${project.forge.kind}. They never touch a remote forge.`);
    this.name = 'LocalForgeRequiredError';
  }
}

export class RehearsalCloneOutsideHomeError extends Error {
  constructor(clonePath: string, home: string) {
    super(`The clone ${clonePath} must be inside the factory home ${home} for a rehearsal: resetting it discards its work`);
    this.name = 'RehearsalCloneOutsideHomeError';
  }
}

function isInside(directory: string, candidate: string): boolean {
  const offset = relative(directory, candidate);
  return offset !== '' && !isAbsolute(offset) && offset !== PARENT_SEGMENT && !offset.startsWith(`${PARENT_SEGMENT}/`);
}

function localForgeOf(project: ProjectConfig): LocalForge {
  if (project.forge.kind !== 'local') throw new LocalForgeRequiredError(project);
  return project.forge;
}

function rehearsalLayout(config: AgentFactoryConfig, project: ProjectConfig, sourceClonePath: string, workingDirectory: string): RehearsalLayout {
  const forge = localForgeOf(project);
  if (!isInside(config.home, project.clonePath)) throw new RehearsalCloneOutsideHomeError(project.clonePath, config.home);
  return {
    sourceClonePath: resolve(workingDirectory, sourceClonePath),
    bareRepositoryPath: forge.bareRepositoryPath,
    workingClonePath: project.clonePath,
    baseBranch: project.baseBranch,
  };
}

function rehearsalRepositories(context: CliContext, project: ProjectConfig): RehearsalRepositories {
  return new RehearsalRepositories(context.runner, projectGitEnvironment(project, context.environment));
}

async function localProject(context: CliContext, requested: string | null): Promise<SelectedProject> {
  const selected = await selectedProject(context, requested);
  localForgeOf(selected.project);
  return selected;
}

export async function rehearsalInitCommand(sourceClonePath: string, requested: string | null, context: CliContext): Promise<number> {
  const { config, project } = await localProject(context, requested);
  const layout = rehearsalLayout(config, project, sourceClonePath, context.workingDirectory);
  const setup = await rehearsalRepositories(context, project).initialise(layout);
  context.output.line(`Local forge of ${project.id} (${setup.bareRepository}): ${layout.bareRepositoryPath}`);
  context.output.line(`Working clone (${setup.workingClone}): ${project.clonePath}`);
  context.output.line(`Base ${project.baseBranch}: ${setup.baseSha}`);
  return EXIT_CODES.ok;
}

export async function rehearsalResetCommand(sourceClonePath: string, requested: string | null, context: CliContext): Promise<number> {
  const { config, project } = await localProject(context, requested);
  const layout = rehearsalLayout(config, project, sourceClonePath, context.workingDirectory);
  const baseSha = await rehearsalRepositories(context, project).resetBase(layout);
  context.output.line(`Base ${project.baseBranch} of ${layout.bareRepositoryPath} and ${project.clonePath} reset to ${baseSha}`);
  return EXIT_CODES.ok;
}

export async function rehearsalAddIssueCommand(specPath: string, labels: readonly string[], requested: string | null, context: CliContext): Promise<number> {
  const { project } = await localProject(context, requested);
  const path = resolve(context.workingDirectory, specPath);
  const file = withExtraLabels(parseSpecFile(await readFile(path, UTF8)), labels);
  const problems = specFileProblems(file, projectConventions(project));
  if (problems.length > 0) {
    context.output.error(`${specPath} is not a valid spec:\n${problems.map((problem) => `- ${problem.message}`).join('\n')}`);
    return EXIT_CODES.failure;
  }
  const forge = await openForge(project, context.runner, context.environment, context.clock);
  const issue = await forge.createIssue(file.title, file.body, file.labels);
  context.output.line(`Local issue ${itemName(project, issue.number)}: ${issue.title} [${issue.labels.join(LABEL_SEPARATOR)}]`);
  return EXIT_CODES.ok;
}
