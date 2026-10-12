import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGitEnvironment, localOnlyGitEnvironment, LocalGitHubGateway, RehearsalRepositories, SpawnCommandRunner } from '@agent-factory/adapters';
import { renderSpecBody } from '@agent-factory/application';
import type { IssueSpec } from '@agent-factory/domain';
import { CONFIG_FILE_NAME, parseFactoryConfig, type FactoryConfig } from '../config/factory-config.ts';
import { factoryGitEnvironment } from '../composition/github-gateway.ts';
import { SystemClock } from '../composition/system.ts';

export const TEST_WEBHOOK_VARIABLE = 'AGENT_FACTORY_TEST_GOOGLE_CHAT_WEBHOOK';
export const TEST_WEBHOOK_URL = 'https://chat.example.invalid/v1/spaces/test/messages';
const BASE_BRANCH = 'main';
const ISOLATED_GIT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Riley',
  GIT_AUTHOR_EMAIL: 'riley@example.test',
  GIT_COMMITTER_NAME: 'Riley',
  GIT_COMMITTER_EMAIL: 'riley@example.test',
};

export interface RehearsalOptions {
  readonly claudeCommand?: readonly string[];
  readonly minimumFreeMemoryPercent?: number;
}

export function rehearsalConfigText(home: string, options: RehearsalOptions = {}): string {
  const claude = options.claudeCommand === undefined ? '{ niceness: null }' : `{ niceness: null, command: ${JSON.stringify(options.claudeCommand)} }`;
  const resources = options.minimumFreeMemoryPercent === undefined ? '' : `resources: { minimumFreeMemoryPercent: ${options.minimumFreeMemoryPercent} }\n`;
  return `
target: { owner: acme, name: widgets, clonePath: ${home}/clone, baseBranch: ${BASE_BRANCH} }
worktreePool: { size: 3 }
concurrency: { issues: 1, ceiling: 3 }
roles:
  acceptance-author: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
  implementer: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5, escalation: { model: sonnet, effort: medium } }
  reviewer: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
  auditor: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
  challenger: { model: haiku, effort: low, maxBudgetUsd: 1, maxTurns: 10, timeoutMinutes: 5 }
gate: { niceness: null }
conventionalCommits: { defaultScope: repo, scopes: { doc: docs } }
github: { mode: local, commitIdentity: { name: Factory, email: factory@example.invalid } }
claude: ${claude}
daemon: { pollIntervalSeconds: 0.05, mergeWatchIntervalMinutes: 0.002, issueRefreshSeconds: 0.05 }
notifications: { googleChatWebhookUrl: { fromEnvironment: ${TEST_WEBHOOK_VARIABLE} }, dedupeWindowMinutes: 1 }
server: { port: 0 }
delivery: { workflow: cloud-delivery.yml, environments: { dev: { name: widgets-dev }, prep: { name: widgets-prep }, prod: { name: widgets-prod } } }
${resources}`;
}

export interface RehearsalEnvironment {
  readonly root: string;
  readonly config: FactoryConfig;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly github: LocalGitHubGateway;
  addDocIssue(title: string): Promise<number>;
  pushDirectCommit(path: string, content: string, message: string): string;
  cleanup(): Promise<void>;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: { ...process.env, ...ISOLATED_GIT }, encoding: 'utf8' }).trim();
}

export async function createRehearsal(options: RehearsalOptions = {}): Promise<RehearsalEnvironment> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'factory-rehearsal-')));
  const source = join(root, 'source');
  await mkdir(source);
  git(source, 'init', '--initial-branch', BASE_BRANCH);
  await writeFile(join(source, 'README.md'), '# widgets\n');
  git(source, 'add', '.');
  git(source, 'commit', '--message', 'chore: seed the repository');
  git(source, 'remote', 'add', 'origin', 'git@github.com:acme/widgets.git');
  const configText = rehearsalConfigText(root, options);
  await writeFile(join(root, CONFIG_FILE_NAME), configText);
  const config = parseFactoryConfig(configText, root, join(root, CONFIG_FILE_NAME));
  const environment = { ...process.env, [TEST_WEBHOOK_VARIABLE]: TEST_WEBHOOK_URL };
  const runner = new SpawnCommandRunner();
  await new RehearsalRepositories(runner, localOnlyGitEnvironment(buildGitEnvironment(environment))).initialise({
    sourceClonePath: source,
    bareRepositoryPath: config.github.local.bareRepositoryPath,
    workingClonePath: config.target.clonePath,
    baseBranch: BASE_BRANCH,
  });
  const github = new LocalGitHubGateway(
    runner,
    {
      directory: config.github.local.directory,
      bareRepositoryPath: config.github.local.bareRepositoryPath,
      baseBranch: BASE_BRANCH,
      checks: config.github.local.checks,
      identity: config.github.commitIdentity,
      environment: factoryGitEnvironment(config, environment),
    },
    new SystemClock(),
  );
  return {
    root,
    config,
    environment,
    github,
    addDocIssue: async (title) => {
      const draft: IssueSpec = {
        number: 1,
        title,
        type: 'doc',
        need: `Readers need ${title.toLowerCase()}.`,
        acceptanceCriteria: ['The page exists.'],
        outOfScope: ['Translations.'],
        expectedProof: 'The rendered page.',
        dependsOn: [],
        commitKind: null,
      };
      const issue = await github.createIssue(title, renderSpecBody(draft), ['type:doc', 'spec:validated']);
      return issue.number;
    },
    pushDirectCommit: (path, content, message) => {
      const clone = config.target.clonePath;
      git(clone, 'fetch', 'origin', BASE_BRANCH);
      git(clone, 'checkout', '--quiet', BASE_BRANCH);
      git(clone, 'reset', '--hard', `origin/${BASE_BRANCH}`);
      writeFileSync(join(clone, path), content);
      git(clone, 'add', path);
      git(clone, 'commit', '--message', message);
      git(clone, 'push', 'origin', `${BASE_BRANCH}:${BASE_BRANCH}`);
      return git(clone, 'rev-parse', 'HEAD');
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
