import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { buildGitEnvironment, localOnlyGitEnvironment, RehearsalRepositories, type RehearsalLayout } from '@agent-factory/adapters';
import { parseSpecFile, specFileProblems, withExtraLabels } from '@agent-factory/application';
import { conventionsFromConfig } from '../../config/conventions-from-config.ts';
import type { FactoryConfig } from '../../config/factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';

const UTF8 = 'utf8';
const PARENT_SEGMENT = '..';
const LABEL_SEPARATOR = ', ';

export class RehearsalModeRequiredError extends Error {
  constructor(configPath: string) {
    super(`Rehearsal commands need github.mode: local in ${configPath}; they never touch GitHub`);
    this.name = 'RehearsalModeRequiredError';
  }
}

export class RehearsalCloneOutsideHomeError extends Error {
  constructor(clonePath: string, home: string) {
    super(`target.clonePath ${clonePath} must be inside the factory home ${home} for a rehearsal`);
    this.name = 'RehearsalCloneOutsideHomeError';
  }
}

function isInside(directory: string, candidate: string): boolean {
  const offset = relative(directory, candidate);
  return offset !== '' && !isAbsolute(offset) && offset !== PARENT_SEGMENT && !offset.startsWith(`${PARENT_SEGMENT}/`);
}

async function rehearsalConfig(context: CliContext): Promise<FactoryConfig> {
  const config = await context.loadConfig();
  if (config.github.mode !== 'local') throw new RehearsalModeRequiredError(config.configPath);
  return config;
}

function rehearsalLayout(config: FactoryConfig, sourceClonePath: string): RehearsalLayout {
  if (!isInside(config.home, config.target.clonePath)) throw new RehearsalCloneOutsideHomeError(config.target.clonePath, config.home);
  return {
    sourceClonePath: resolve(sourceClonePath),
    bareRepositoryPath: config.github.local.bareRepositoryPath,
    workingClonePath: config.target.clonePath,
    baseBranch: config.target.baseBranch,
  };
}

function rehearsalRepositories(context: CliContext): RehearsalRepositories {
  return new RehearsalRepositories(context.runner, localOnlyGitEnvironment(buildGitEnvironment(context.environment)));
}

export async function rehearsalInitCommand(sourceClonePath: string, context: CliContext): Promise<number> {
  const config = await rehearsalConfig(context);
  const setup = await rehearsalRepositories(context).initialise(rehearsalLayout(config, sourceClonePath));
  context.output.line(`Rehearsal remote (${setup.bareRepository}): ${config.github.local.bareRepositoryPath}`);
  context.output.line(`Working clone (${setup.workingClone}): ${config.target.clonePath}`);
  context.output.line(`Base ${config.target.baseBranch}: ${setup.baseSha}`);
  return EXIT_CODES.ok;
}

export async function rehearsalResetCommand(sourceClonePath: string, context: CliContext): Promise<number> {
  const config = await rehearsalConfig(context);
  const baseSha = await rehearsalRepositories(context).resetBase(rehearsalLayout(config, sourceClonePath));
  context.output.line(`Base ${config.target.baseBranch} of ${config.github.local.bareRepositoryPath} and ${config.target.clonePath} reset to ${baseSha}`);
  return EXIT_CODES.ok;
}

export async function rehearsalAddIssueCommand(specPath: string, labels: readonly string[], context: CliContext): Promise<number> {
  const config = await rehearsalConfig(context);
  const file = withExtraLabels(parseSpecFile(await readFile(specPath, UTF8)), labels);
  const problems = specFileProblems(file, conventionsFromConfig(config));
  if (problems.length > 0) {
    context.output.error(`${specPath} is not a valid spec:\n${problems.map((problem) => `- ${problem.message}`).join('\n')}`);
    return EXIT_CODES.failure;
  }
  const factory = await context.openFactory(config);
  try {
    const issue = await factory.dependencies.github.createIssue(file.title, file.body, file.labels);
    context.output.line(`Local issue #${issue.number}: ${issue.title} [${issue.labels.join(LABEL_SEPARATOR)}]`);
    return EXIT_CODES.ok;
  } finally {
    factory.close();
  }
}
