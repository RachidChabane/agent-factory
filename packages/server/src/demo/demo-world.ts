import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildGitEnvironment, localOnlyGitEnvironment, RehearsalRepositories } from '@agent-factory/adapters';
import type { Clock, CommandRunner } from '@agent-factory/application';
import { stringify } from 'yaml';
import { CONFIG_FILE_NAME, parseAgentFactoryConfig, PROJECTS_DIRECTORY, type AgentFactoryConfig } from '../config/agent-factory-config.ts';
import { CONFIG_SCHEMA_ID } from '../config/config-json-schema.ts';
import type { SourceEnvironment } from '../composition/installation/installation-context.ts';
import type { DemoHealthEndpoints } from './demo-health.ts';
import { DEMO_UPLOAD_COMMAND_MAIN, DEMO_UPLOADS_DIRECTORY_NAME, EXAMPLES_DIRECTORY, FAKE_CLAUDE_MAIN } from './demo-paths.ts';

export const DEMO_SERVER_PORT = 7431;
export const DEMO_BASE_BRANCH = 'main';
const SOURCES_DIRECTORY = 'sources';
const REFERENCE_SOURCES_DIRECTORY = 'references';
const DEMO_DIRECTORY = 'demo';
const SCENARIO_FILE = 'scenario.json';
const FAKE_STATE_DIRECTORY = 'fake-claude';
const ACCOUNT_DIRECTORY = 'claude-primary';
const SESSIONS_DIRECTORY = 'sessions';
const CLONE_DIRECTORY = 'clone';
const FORGE_DIRECTORY = 'forge';
/** Each local forge runs its project's gate on every pull request, as continuous integration would. */
const LOCAL_CHECKS = 'gate';
const BARE_SUFFIX = '.git';
const PRIVATE_DIRECTORY_MODE = 0o700;
const GIT_TIMEOUT_MS = 60_000;
const EXIT_CODE_OK = 0;
const MILLISECONDS_PER_DAY = 86_400_000;
const EXCLUDED_EXAMPLE_ENTRIES: readonly string[] = ['node_modules', '.factory'];

export interface DemoCommit {
  readonly author: { readonly name: string; readonly email: string };
  readonly daysAgo: number;
  readonly message: string;
  /** Files the commit writes, by path from the root; the first commit takes the whole example. */
  readonly files: Readonly<Record<string, string>>;
  readonly tag: string | null;
}

/** Another fictional repository the specifications of a project cite, created as a local clone with one tagged commit. */
export interface DemoReference {
  readonly name: string;
  /** The `owner/name` the specifications cite. */
  readonly repository: string;
  readonly tag: string;
  readonly author: DemoCommit['author'];
  readonly daysAgo: number;
  /** The files of the tagged commit, by path from the root. */
  readonly files: Readonly<Record<string, string>>;
}

export interface DemoProject {
  readonly id: string;
  readonly name: string;
  readonly repository: string;
  readonly example: string;
  readonly history: readonly DemoCommit[];
  /** The repositories the project's specifications cite; the project's entry names a local clone of each, tagged. */
  readonly references?: readonly DemoReference[];
  /** The project's entry in config.yaml, without its id, name and forge. */
  readonly settings: (health: DemoHealthEndpoints) => Readonly<Record<string, unknown>>;
  /** Tools with a login and a keep-alive, which keep their sessions as files of the given directory. */
  readonly sessionTools?: (sessionsDirectory: string) => readonly Readonly<Record<string, unknown>>[];
}

export interface DemoWorldSettings {
  readonly home: string;
  readonly port: number;
  readonly runner: CommandRunner;
  readonly environment: SourceEnvironment;
  readonly clock: Clock;
  readonly userHome: string;
  readonly health: DemoHealthEndpoints;
  readonly projects: readonly DemoProject[];
  /** The scripted agents the fake Claude plays, as its scenario file. */
  readonly scenario: unknown;
  /** Installation settings of the demonstration besides the fake Claude and the port. */
  readonly installation: Readonly<Record<string, unknown>>;
}

export interface DemoWorld {
  readonly home: string;
  readonly config: AgentFactoryConfig;
  readonly sources: ReadonlyMap<string, string>;
}

async function git(settings: DemoWorldSettings, cwd: string, args: readonly string[], environment: Readonly<Record<string, string>>): Promise<void> {
  const result = await settings.runner.run(['git', ...args], cwd, GIT_TIMEOUT_MS, environment);
  if (result.exitCode !== EXIT_CODE_OK || result.timedOut) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${`${result.stdout}${result.stderr}`.trim()}`);
}

function commitEnvironment(settings: DemoWorldSettings, commit: DemoCommit): Readonly<Record<string, string>> {
  const date = new Date(settings.clock.now().getTime() - commit.daysAgo * MILLISECONDS_PER_DAY).toISOString();
  return {
    ...localOnlyGitEnvironment(buildGitEnvironment(settings.environment)),
    GIT_AUTHOR_NAME: commit.author.name,
    GIT_AUTHOR_EMAIL: commit.author.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: commit.author.name,
    GIT_COMMITTER_EMAIL: commit.author.email,
    GIT_COMMITTER_DATE: date,
  };
}

/** A source repository with the project's history, from which its local forge is mirrored. */
async function createSource(settings: DemoWorldSettings, project: DemoProject): Promise<string> {
  const source = join(settings.home, SOURCES_DIRECTORY, project.id);
  await cp(join(EXAMPLES_DIRECTORY, project.example), source, { recursive: true, filter: (path) => !EXCLUDED_EXAMPLE_ENTRIES.some((entry) => path.endsWith(`/${entry}`)) });
  const plain = localOnlyGitEnvironment(buildGitEnvironment(settings.environment));
  await git(settings, source, ['init', '--quiet', '--initial-branch', DEMO_BASE_BRANCH], plain);
  for (const commit of project.history) {
    for (const [path, content] of Object.entries(commit.files)) {
      await mkdir(join(source, path, '..'), { recursive: true });
      await writeFile(join(source, path), content);
    }
    const environment = commitEnvironment(settings, commit);
    await git(settings, source, ['add', '--all'], environment);
    await git(settings, source, ['commit', '--quiet', '--message', commit.message], environment);
    if (commit.tag !== null) await git(settings, source, ['tag', commit.tag], environment);
  }
  return source;
}

/** A local clone holding the files of a cited repository in one commit, tagged, which the project's `references` entry takes its snapshot from. */
async function createReferenceSource(settings: DemoWorldSettings, reference: DemoReference): Promise<string> {
  const source = join(settings.home, SOURCES_DIRECTORY, REFERENCE_SOURCES_DIRECTORY, reference.name);
  await mkdir(source, { recursive: true });
  const commit: DemoCommit = { author: reference.author, daysAgo: reference.daysAgo, message: `chore: publish ${reference.tag}`, files: reference.files, tag: reference.tag };
  const plain = localOnlyGitEnvironment(buildGitEnvironment(settings.environment));
  await git(settings, source, ['init', '--quiet', '--initial-branch', DEMO_BASE_BRANCH], plain);
  for (const [path, content] of Object.entries(commit.files)) {
    await mkdir(join(source, path, '..'), { recursive: true });
    await writeFile(join(source, path), content);
  }
  const environment = commitEnvironment(settings, commit);
  await git(settings, source, ['add', '--all'], environment);
  await git(settings, source, ['commit', '--quiet', '--message', commit.message], environment);
  await git(settings, source, ['tag', reference.tag], environment);
  return source;
}

async function createForge(settings: DemoWorldSettings, project: DemoProject, source: string): Promise<void> {
  const directory = join(settings.home, PROJECTS_DIRECTORY, project.id);
  const repositoryName = project.repository.split('/').at(-1) ?? project.id;
  await new RehearsalRepositories(settings.runner, localOnlyGitEnvironment(buildGitEnvironment(settings.environment))).initialise({
    sourceClonePath: source,
    bareRepositoryPath: join(directory, FORGE_DIRECTORY, `${repositoryName}${BARE_SUFFIX}`),
    workingClonePath: join(directory, CLONE_DIRECTORY),
    baseBranch: DEMO_BASE_BRANCH,
  });
}

function referenceEntries(project: DemoProject, sources: ReadonlyMap<string, string>): readonly Readonly<Record<string, unknown>>[] {
  return (project.references ?? []).map((reference) => ({ name: reference.name, repository: reference.repository, ref: reference.tag, source: sources.get(reference.name) }));
}

function projectEntry(project: DemoProject, settings: DemoWorldSettings, referenceSources: ReadonlyMap<string, string>): Readonly<Record<string, unknown>> {
  const entry = project.settings(settings.health);
  const references = referenceEntries(project, referenceSources);
  const declared: readonly unknown[] = Array.isArray(entry['tools']) ? entry['tools'] : [];
  const sessionTools = project.sessionTools?.(join(settings.home, DEMO_DIRECTORY, SESSIONS_DIRECTORY)) ?? [];
  const tools = [...declared, ...sessionTools];
  return {
    id: project.id,
    name: project.name,
    forge: { kind: 'local', repository: project.repository, directory: FORGE_DIRECTORY, checks: LOCAL_CHECKS },
    clone: CLONE_DIRECTORY,
    ...entry,
    ...(tools.length === 0 ? {} : { tools }),
    ...(references.length === 0 ? {} : { references }),
  };
}

/** The upload command of the demonstration: it copies a file into the uploads directory of its home and prints the file address of the copy. */
function demoMedia(home: string): Readonly<Record<string, unknown>> {
  return { upload: [process.execPath, DEMO_UPLOAD_COMMAND_MAIN, '--to', join(home, DEMO_UPLOADS_DIRECTORY_NAME), '--file', '{file}'] };
}

/** The notification settings of the demonstration: the installation's own, and the upload command of its media. */
function demoNotifications(settings: DemoWorldSettings): Readonly<Record<string, unknown>> {
  const declared = settings.installation['notifications'];
  return { ...(typeof declared === 'object' && declared !== null ? declared : {}), media: demoMedia(settings.home) };
}

function configText(settings: DemoWorldSettings, scenarioPath: string, fakeState: string, referenceSources: ReadonlyMap<string, string>): string {
  const document = {
    version: 1,
    server: { port: settings.port },
    claude: {
      command: [process.execPath, FAKE_CLAUDE_MAIN, '--scenario', scenarioPath, '--state', fakeState],
      accounts: [{ name: 'primary', configDir: join(DEMO_DIRECTORY, ACCOUNT_DIRECTORY), billing: 'subscription' }],
    },
    ...settings.installation,
    notifications: demoNotifications(settings),
    projects: settings.projects.map((project) => projectEntry(project, settings, referenceSources)),
  };
  return `# yaml-language-server: $schema=${CONFIG_SCHEMA_ID}\n${stringify(document, { lineWidth: 0 })}`;
}

/** Creates the demonstration's home: fictional repositories on local forges, the fake Claude's scenario, and config.yaml. */
export async function prepareDemoWorld(settings: DemoWorldSettings): Promise<DemoWorld> {
  const demoDirectory = join(settings.home, DEMO_DIRECTORY);
  await mkdir(join(demoDirectory, ACCOUNT_DIRECTORY), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const scenarioPath = join(demoDirectory, SCENARIO_FILE);
  await writeFile(scenarioPath, `${JSON.stringify(settings.scenario, null, 2)}\n`);
  const sources = new Map<string, string>();
  const referenceSources = new Map<string, string>();
  for (const project of settings.projects) {
    for (const reference of project.references ?? []) referenceSources.set(reference.name, await createReferenceSource(settings, reference));
    const source = await createSource(settings, project);
    await createForge(settings, project, source);
    sources.set(project.id, source);
  }
  const configPath = join(settings.home, CONFIG_FILE_NAME);
  const text = configText(settings, scenarioPath, join(demoDirectory, FAKE_STATE_DIRECTORY), referenceSources);
  await writeFile(configPath, text, { mode: 0o600 });
  return { home: settings.home, config: parseAgentFactoryConfig(text, settings.home, configPath, settings.userHome), sources };
}
