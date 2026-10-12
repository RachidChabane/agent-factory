import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildGitEnvironment, RehearsalRepositories } from '@agent-factory/adapters';
import type { CommandRunner } from '@agent-factory/application';
import { IDENTIFIER } from '../../config/schema/common.ts';
import { DEFAULT_BASE_BRANCH } from '../../config/schema/project.ts';
import { configPathOf, factoryHome, parseAgentFactoryConfig, projectOf, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { ConfigFile, configBackupsDirectory } from '../../config/config-file.ts';
import { newConfigText, withProjectEntry } from '../../config/project-entry.ts';
import { projectGitEnvironment } from '../../composition/project/forge.ts';
import type { CliContext } from '../cli-context.ts';
import { COMMAND_NAMES, PROGRAM_NAME, type CliCommand } from '../command-line.ts';
import { detectAutomations, detectReleaseModel } from '../init/delivery-detection.ts';
import { localRepositorySlug, projectDraft, projectIdOf } from '../init/project-draft.ts';
import { inspectRepository, INSPECTION_TIMEOUT_MS, type RepositoryFacts } from '../init/repository-inspection.ts';
import { detectStack, type DraftCommand, type StackCommands } from '../init/stack-detectors.ts';
import { EXIT_CODES } from '../output.ts';

type InitCommand = Extract<CliCommand, { readonly kind: 'init' }>;

const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const EXIT_CODE_OK = 0;
const CLONE_TIMEOUT_MS = 600_000;

export class GitHubOriginRequiredError extends Error {
  constructor(root: string) {
    super(`${root} has no GitHub origin; pass --forge local to rehearse on a local forge, or add the GitHub remote as origin`);
    this.name = 'GitHubOriginRequiredError';
  }
}

export class InvalidProjectIdError extends Error {
  constructor(id: string) {
    super(`"${id}" cannot be a project id: use lowercase letters, digits and dashes, starting with a letter`);
    this.name = 'InvalidProjectIdError';
  }
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, UTF8);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return null;
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function versionTags(runner: CommandRunner, root: string, environment: Readonly<Record<string, string>>): Promise<readonly string[]> {
  const result = await runner.run(['git', '-C', root, 'tag', '--list'], root, INSPECTION_TIMEOUT_MS, environment).catch(() => null);
  return result === null || result.exitCode !== EXIT_CODE_OK ? [] : result.stdout.split('\n').filter((tag) => tag !== '');
}

async function git(runner: CommandRunner, args: readonly string[], cwd: string, environment: Readonly<Record<string, string>>): Promise<void> {
  const result = await runner.run(['git', ...args], cwd, CLONE_TIMEOUT_MS, environment);
  if (result.exitCode !== EXIT_CODE_OK || result.timedOut) throw new Error(`git ${args.join(' ')} failed: ${`${result.stdout}${result.stderr}`.trim()}`);
}

/** Gives the project its own clone, copied from the inspected repository so nothing is downloaded; origin then points where the repository's does. */
async function prepareClone(project: ProjectConfig, facts: RepositoryFacts, context: CliContext): Promise<string> {
  if (await exists(project.clonePath)) return `kept the existing clone ${project.clonePath}`;
  const environment = projectGitEnvironment(project, context.environment);
  if (project.forge.kind === 'local') {
    const setup = await new RehearsalRepositories(context.runner, environment).initialise({
      sourceClonePath: facts.root,
      bareRepositoryPath: project.forge.bareRepositoryPath,
      workingClonePath: project.clonePath,
      baseBranch: project.baseBranch,
    });
    return `created the local forge ${project.forge.bareRepositoryPath} and the clone ${project.clonePath} at ${setup.baseSha}`;
  }
  await mkdir(dirname(project.clonePath), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await git(context.runner, ['clone', '--quiet', '--no-hardlinks', facts.root, project.clonePath], dirname(project.clonePath), environment);
  if (facts.originUrl !== null) await git(context.runner, ['-C', project.clonePath, 'remote', 'set-url', 'origin', facts.originUrl], project.clonePath, environment);
  return `cloned ${facts.root} into ${project.clonePath}, with origin ${facts.originUrl ?? 'unset'}`;
}

function commandLines(title: string, commands: readonly DraftCommand[]): readonly string[] {
  return commands.length === 0 ? [] : [`  ${title}:`, ...commands.map((command) => `    ${command.name}: ${command.run}${command.network === undefined ? '' : ` (network: ${command.network})`}`)];
}

function stackLines(stack: StackCommands | null): readonly string[] {
  if (stack === null) return ['No build was recognised: the project has no setup or gate command; add them to config.yaml before the factory takes an issue.'];
  return [
    `Recognised ${stack.stack}:`,
    ...commandLines('setup', stack.setup),
    ...commandLines('gate before the acceptance checks', stack.beforeAcceptance),
    ...commandLines('gate after the acceptance checks', stack.afterAcceptance),
  ];
}

async function writeConfig(path: string, text: string, existing: boolean, context: CliContext, stateDirectory: string): Promise<string | null> {
  if (existing) return new ConfigFile(path, configBackupsDirectory(stateDirectory), context.clock).replace(text);
  await mkdir(dirname(path), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await writeFile(path, text, { encoding: UTF8, flag: 'wx', mode: PRIVATE_FILE_MODE });
  return null;
}

/** Inspects a repository, adds it to config.yaml as a project, checks the result loads, and gives the project its clone. */
export async function initCommand(command: InitCommand, context: CliContext): Promise<number> {
  const gitEnvironment = buildGitEnvironment(context.environment);
  const facts = await inspectRepository(resolve(context.workingDirectory, command.repository ?? '.'), context.runner, gitEnvironment, DEFAULT_BASE_BRANCH);
  const forge = command.forge ?? (facts.githubSlug === null ? 'local' : 'github');
  if (forge === 'github' && facts.githubSlug === null) throw new GitHubOriginRequiredError(facts.root);
  const id = command.id ?? projectIdOf(facts.name);
  if (!IDENTIFIER.test(id)) throw new InvalidProjectIdError(id);
  const stack = await detectStack(facts.files);
  const draft = projectDraft({
    id,
    name: command.name ?? facts.name,
    forge,
    repository: facts.githubSlug ?? localRepositorySlug(facts.name),
    facts,
    stack,
    release: detectReleaseModel(facts.files, await versionTags(context.runner, facts.root, gitEnvironment)),
    automations: detectAutomations(facts.files),
  });
  const home = factoryHome(context.environment, context.userHome);
  const configPath = configPathOf(home);
  const current = await readIfPresent(configPath);
  const text = current === null ? newConfigText(draft) : withProjectEntry(current, draft, command.force);
  const config = parseAgentFactoryConfig(text, home, configPath, context.userHome);
  const backup = await writeConfig(configPath, text, current !== null, context, config.directories.state);
  const project = projectOf(config, id);
  for (const line of stackLines(stack)) context.output.line(line);
  context.output.line(`Project ${id} written to ${configPath}${backup === null ? '' : ` (previous file kept as ${backup})`}`);
  context.output.line(`Clone: ${await prepareClone(project, facts, context)}`);
  context.output.line(`Next: "${PROGRAM_NAME} ${COMMAND_NAMES.validate}" checks the tools, the forge and the gate commands; "${PROGRAM_NAME} ${COMMAND_NAMES.start}" runs the factory on every project.`);
  return EXIT_CODES.ok;
}
