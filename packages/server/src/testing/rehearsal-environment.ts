import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalGitHubGateway, RehearsalRepositories, SpawnCommandRunner } from '@agent-factory/adapters';
import { renderSpecBody } from '@agent-factory/application';
import { filmLabel, type IssueSpec } from '@agent-factory/domain';
import { stringify } from 'yaml';
import { CONFIG_FILE_NAME, parseAgentFactoryConfig, projectOf, type AgentFactoryConfig, type ProjectConfig } from '../config/agent-factory-config.ts';
import { projectGitEnvironment } from '../composition/project/forge.ts';
import { projectConventions } from '../composition/project/project-settings.ts';
import { SystemClock } from '../composition/system.ts';

export const TEST_WEBHOOK_VARIABLE = 'AGENT_FACTORY_TEST_GOOGLE_CHAT_WEBHOOK';
export const TEST_WEBHOOK_URL = 'https://chat.example.invalid/v1/spaces/test/messages';
export const FIRST_PROJECT = 'widgets';
export const SECOND_PROJECT = 'gadgets';
const OWNER = 'acme';
const BASE_BRANCH = 'main';
const DOCS_TYPE = 'docs';
const ISOLATED_GIT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Riley',
  GIT_AUTHOR_EMAIL: 'riley@example.test',
  GIT_COMMITTER_NAME: 'Riley',
  GIT_COMMITTER_EMAIL: 'riley@example.test',
};
const QUICK_ROLE = { model: 'haiku', effort: 'low', maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 };

export interface RehearsalOptions {
  readonly claudeCommand?: readonly string[];
  readonly minimumFreeMemoryPercent?: number;
  /** The projects of the installation, each on its own local forge; one project when absent. */
  readonly projects?: readonly string[];
  /** Settings a project declares besides its identity and forge, such as its delivery environments. */
  readonly projectSettings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** The tools the installation declares (`tools`); none when absent. */
  readonly tools?: readonly Record<string, unknown>[];
  /** The upload command of the media of the notices (`notifications.media`); none when absent. */
  readonly media?: Readonly<Record<string, unknown>>;
  /** How long an empty list of checks is waited on, in seconds; a local forge that runs no check has nothing to wait for. */
  readonly checksSettleSeconds?: number;
}

function projectEntry(id: string, extra: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    forge: { kind: 'local', repository: `${OWNER}/${id}` },
    commitIdentity: { name: 'Factory', email: 'factory@example.invalid' },
    conventions: { defaultScope: 'repo' },
    worktrees: { size: 3 },
    concurrency: { issues: 1, ceiling: 3 },
    gate: { niceness: null },
    ...extra,
  };
}

export function rehearsalConfigText(options: RehearsalOptions = {}): string {
  const document = {
    version: 1,
    server: { port: 0 },
    claude: { niceness: null, ...(options.claudeCommand === undefined ? {} : { command: options.claudeCommand }) },
    ...(options.minimumFreeMemoryPercent === undefined ? {} : { resources: { minimumFreeMemoryPercent: options.minimumFreeMemoryPercent } }),
    daemon: { pollIntervalSeconds: 0.05, mergeWatchIntervalMinutes: 0.002, issueRefreshSeconds: 0.05, checksSettleSeconds: options.checksSettleSeconds ?? 0 },
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    notifications: {
      dedupeWindowMinutes: 1,
      channels: [{ kind: 'google-chat', webhookUrl: { fromEnvironment: TEST_WEBHOOK_VARIABLE } }],
      ...(options.media === undefined ? {} : { media: options.media }),
    },
    defaults: {
      roles: {
        'acceptance-author': QUICK_ROLE,
        implementer: { ...QUICK_ROLE, escalation: { model: 'sonnet', effort: 'medium' } },
        reviewer: QUICK_ROLE,
        auditor: QUICK_ROLE,
        challenger: QUICK_ROLE,
      },
    },
    projects: (options.projects ?? [FIRST_PROJECT]).map((id) => projectEntry(id, options.projectSettings?.[id] ?? {})),
  };
  return stringify(document);
}

export interface RehearsalProject {
  readonly id: string;
  readonly config: ProjectConfig;
  readonly forge: LocalGitHubGateway;
  /** A validated documentation issue; `films` are the scenarios its spec declares. */
  addDocIssue(title: string, films?: readonly string[]): Promise<number>;
  /** A documentation issue whose spec the operator has not validated yet. */
  addDraftDocIssue(title: string): Promise<number>;
  /** Pushes a commit straight to the base branch of the project's local forge, as someone outside the factory would. */
  pushDirectCommit(path: string, content: string, message: string): string;
}

export interface RehearsalEnvironment {
  readonly root: string;
  readonly config: AgentFactoryConfig;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly projects: readonly RehearsalProject[];
  project(id: string): RehearsalProject;
  cleanup(): Promise<void>;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: { ...process.env, ...ISOLATED_GIT }, encoding: 'utf8' }).trim();
}

async function sourceRepository(root: string, id: string): Promise<string> {
  const source = join(root, 'sources', id);
  await mkdir(source, { recursive: true });
  git(source, 'init', '--quiet', '--initial-branch', BASE_BRANCH);
  await writeFile(join(source, 'README.md'), `# ${id}\n`);
  git(source, 'add', '.');
  git(source, 'commit', '--quiet', '--message', 'chore: seed the repository');
  git(source, 'remote', 'add', 'origin', `git@github.com:${OWNER}/${id}.git`);
  return source;
}

function docIssue(title: string): IssueSpec {
  return {
    number: 1,
    title,
    type: DOCS_TYPE,
    need: `Readers need ${title.toLowerCase()}.`,
    acceptanceCriteria: ['The page exists.'],
    outOfScope: ['Translations.'],
    expectedProof: 'The rendered page.',
    dependsOn: [],
    commitKind: null,
    films: [],
  };
}

async function rehearsalProject(config: AgentFactoryConfig, id: string, source: string, environment: Readonly<Record<string, string | undefined>>): Promise<RehearsalProject> {
  const project = projectOf(config, id);
  if (project.forge.kind !== 'local') throw new Error(`${id} is not on a local forge`);
  const runner = new SpawnCommandRunner();
  const gitEnvironment = projectGitEnvironment(project, environment);
  await new RehearsalRepositories(runner, gitEnvironment).initialise({
    sourceClonePath: source,
    bareRepositoryPath: project.forge.bareRepositoryPath,
    workingClonePath: project.clonePath,
    baseBranch: BASE_BRANCH,
  });
  const forge = new LocalGitHubGateway(
    runner,
    {
      directory: project.forge.directory,
      bareRepositoryPath: project.forge.bareRepositoryPath,
      baseBranch: BASE_BRANCH,
      checks: project.forge.checks,
      identity: project.commitIdentity,
      environment: gitEnvironment,
    },
    new SystemClock(),
  );
  const conventions = projectConventions(project);
  return {
    id,
    config: project,
    forge,
    addDocIssue: async (title, films = []) => {
      const spec = docIssue(title);
      const labels = [conventions.typology.get(spec.type).label, conventions.labels.validated, ...films.map(filmLabel)];
      const issue = await forge.createIssue(title, renderSpecBody({ ...spec, films }, conventions), labels);
      return issue.number;
    },
    addDraftDocIssue: async (title) => {
      const spec = docIssue(title);
      const issue = await forge.createIssue(title, renderSpecBody(spec, conventions), [conventions.typology.get(spec.type).label]);
      return issue.number;
    },
    pushDirectCommit: (path, content, message) => {
      const clone = project.clonePath;
      git(clone, 'fetch', '--quiet', 'origin', BASE_BRANCH);
      git(clone, 'checkout', '--quiet', BASE_BRANCH);
      git(clone, 'reset', '--quiet', '--hard', `origin/${BASE_BRANCH}`);
      writeFileSync(join(clone, path), content);
      git(clone, 'add', path);
      git(clone, 'commit', '--quiet', '--message', message);
      git(clone, 'push', '--quiet', 'origin', `${BASE_BRANCH}:${BASE_BRANCH}`);
      return git(clone, 'rev-parse', 'HEAD');
    },
  };
}

/** An installation in a temporary home whose projects each sit on a local forge mirrored from a fresh repository. */
export async function createRehearsal(options: RehearsalOptions = {}): Promise<RehearsalEnvironment> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'factory-rehearsal-')));
  const configText = rehearsalConfigText(options);
  const configPath = join(root, CONFIG_FILE_NAME);
  await writeFile(configPath, configText);
  const config = parseAgentFactoryConfig(configText, root, configPath, root);
  const environment = { ...process.env, AGENT_FACTORY_HOME: root, [TEST_WEBHOOK_VARIABLE]: TEST_WEBHOOK_URL };
  const projects: RehearsalProject[] = [];
  for (const project of config.projects) projects.push(await rehearsalProject(config, project.id, await sourceRepository(root, project.id), environment));
  return {
    root,
    config,
    environment,
    projects,
    project: (id) => {
      const found = projects.find((project) => project.id === id);
      if (found === undefined) throw new Error(`no rehearsal project ${id}`);
      return found;
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function waitFor<T>(probe: () => Promise<T | null | undefined | false>, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null && value !== undefined && value !== false) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
