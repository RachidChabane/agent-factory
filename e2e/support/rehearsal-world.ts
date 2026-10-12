import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildGitEnvironment, localOnlyGitEnvironment, SpawnCommandRunner } from '../../packages/adapters/src/index.ts';
import { LocalGitHubFiles } from '../../packages/adapters/src/github-local/localGitHubFiles.ts';
import { SystemClock } from '../../packages/server/src/composition/system.ts';
import { startDemoHealthEndpoints } from '../../packages/server/src/demo/demo-health.ts';
import { DEMO_ENVIRONMENTS, DEMO_INSTALLATION, DEMO_PROJECTS, STOREFRONT_ID } from '../../packages/server/src/demo/demo-projects.ts';
import { FAKE_CLAUDE_MAIN } from '../../packages/server/src/demo/demo-paths.ts';
import { prepareDemoWorld, type DemoCommit, type DemoProject } from '../../packages/server/src/demo/demo-world.ts';
import { storyScenario } from '../../packages/server/src/demo/story/scenario.ts';
import { LEDGER_STORY } from '../../packages/server/src/demo/story/ledger-story.ts';
import { STOREFRONT_STORY } from '../../packages/server/src/demo/story/storefront-story.ts';
import { DANA_REYES } from '../../packages/server/src/demo/story/story-people.ts';
import { REPOSITORY_ROOT } from './paths.ts';
import { HOLD_FILE_NAME, stagingDeployments } from './rehearsal-layout.ts';
import { rehearsalScenario } from './rehearsal-scenario.ts';

/**
 * Prepares the home of a rehearsal: the demonstration's two projects on local forges with the fake Claude,
 * but no story, so the specs create the work through the cockpit. It stays alive to serve the health
 * endpoints the configuration points at, and removes the home when it receives SIGTERM.
 */
const HOME_PREFIX = 'agent-factory-rehearsal-';
const HEALTH_PORT_OFFSET = 1;
const SLOW_CLAUDE = join(REPOSITORY_ROOT, 'e2e', 'support', 'slow-claude.ts');
const GIT_TIMEOUT_MS = 30_000;
const STAGING_TAGS = { previous: 'v1.3.0', current: 'v1.4.0' } as const;
const RELEASE_BRANCH = 'release-please--branches--main';
const RELEASE_TITLE = 'chore(main): release 1.5.0';
const RELEASE_AUTHOR = { name: 'Release Bot', email: 'release-bot@example.com' };

const { values } = parseArgs({ options: { port: { type: 'string' } } });
const port = Number(values.port);
if (!Number.isInteger(port)) throw new Error('usage: rehearsal-world.ts --port <port>');

/** An issue keeps its worktree until its pull request is merged, so the pool has room for every issue the specs take to a pull request. */
const REHEARSAL_WORKTREE_POOL_SIZE = 12;

/** A change merged after the last release tag: the release pull request announces it, and a release with no change cannot be cut. */
const UNRELEASED_CHANGE: DemoCommit = {
  author: { name: DANA_REYES.name, email: DANA_REYES.email },
  daysAgo: 3,
  message: 'docs: describe the product categories of the shop',
  files: { 'docs/categories.md': '# Categories\n\nThe shop sells kitchen, apparel and bag products.\n' },
  tag: null,
};

/** The storefront deploys staging from its forge, can redeploy it, and releases through release pull requests. */
function withRehearsalDelivery(project: DemoProject): DemoProject {
  if (project.id !== STOREFRONT_ID) return project;
  return {
    ...project,
    history: [...project.history, UNRELEASED_CHANGE],
    settings: (health) => {
      const entry = project.settings(health);
      const delivery = entry['delivery'] as { environments: Record<string, unknown>[] };
      return {
        ...entry,
        worktrees: { size: REHEARSAL_WORKTREE_POOL_SIZE },
        delivery: {
          ...delivery,
          release: { kind: 'release-please', tagPattern: 'v*.*.*' },
          environments: delivery.environments.map((environment) =>
            environment['name'] === 'staging'
              ? { ...environment, deployments: { kind: 'github', environment: 'staging' }, redeploy: { workflow: 'deploy-staging.yml', inputs: { version: '{{version}}', target: '{{target}}' } } }
              : environment,
          ),
        },
      };
    },
  };
}

const home = await mkdtemp(join(tmpdir(), HOME_PREFIX));
const health = await startDemoHealthEndpoints(DEMO_ENVIRONMENTS, port + HEALTH_PORT_OFFSET);
const demoDirectory = join(home, 'demo');
const claude = {
  command: [
    process.execPath,
    SLOW_CLAUDE,
    '--hold-file',
    join(home, HOLD_FILE_NAME),
    '--',
    process.execPath,
    FAKE_CLAUDE_MAIN,
    '--scenario',
    join(demoDirectory, 'scenario.json'),
    '--state',
    join(demoDirectory, 'fake-claude'),
  ],
  accounts: [{ name: 'primary', configDir: join('demo', 'claude-primary'), billing: 'subscription' }],
};

async function shutDown(): Promise<void> {
  await health.close();
  await rm(home, { recursive: true, force: true });
  process.exit(0);
}
process.once('SIGTERM', () => void shutDown());
process.once('SIGINT', () => void shutDown());

const runner = new SpawnCommandRunner();
const world = await prepareDemoWorld({
  home,
  port,
  runner,
  environment: process.env,
  clock: new SystemClock(),
  userHome: homedir(),
  health,
  projects: DEMO_PROJECTS.map(withRehearsalDelivery),
  scenario: rehearsalScenario(storyScenario([STOREFRONT_STORY, LEDGER_STORY])),
  installation: { ...DEMO_INSTALLATION, claude },
});
const storefront = world.config.projects.find((project) => project.id === STOREFRONT_ID);
if (storefront === undefined || storefront.forge.kind !== 'local') throw new Error('the storefront has no local forge');
const { directory: forgeDirectory, bareRepositoryPath } = storefront.forge;
async function commitOf(tag: string): Promise<string> {
  const { stdout } = await runner.run(['git', `--git-dir=${bareRepositoryPath}`, 'rev-parse', `${tag}^{commit}`], home, GIT_TIMEOUT_MS, {});
  return stdout.trim();
}
const deploymentsDirectory = join(forgeDirectory, 'deployments');
await mkdir(deploymentsDirectory, { recursive: true });
const deployments = stagingDeployments({
  previous: { tag: STAGING_TAGS.previous, sha: await commitOf(STAGING_TAGS.previous) },
  current: { tag: STAGING_TAGS.current, sha: await commitOf(STAGING_TAGS.current) },
});
await writeFile(join(deploymentsDirectory, 'staging.json'), `${JSON.stringify(deployments, null, 2)}\n`);

/** A release pull request, as release-please opens one: a branch with the changelog, and the pull request on the local forge. */
async function openReleasePullRequest(): Promise<void> {
  const plain = localOnlyGitEnvironment(buildGitEnvironment(process.env));
  const author = { ...plain, GIT_AUTHOR_NAME: RELEASE_AUTHOR.name, GIT_AUTHOR_EMAIL: RELEASE_AUTHOR.email, GIT_COMMITTER_NAME: RELEASE_AUTHOR.name, GIT_COMMITTER_EMAIL: RELEASE_AUTHOR.email };
  const clone = join(home, 'people', 'release-bot');
  await mkdir(join(home, 'people'), { recursive: true });
  const git = async (cwd: string, args: readonly string[], environment: Readonly<Record<string, string>>): Promise<void> => {
    const result = await runner.run(['git', ...args], cwd, GIT_TIMEOUT_MS, environment);
    if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stdout}${result.stderr}`);
  };
  await git(home, ['clone', '--quiet', '--branch', 'main', bareRepositoryPath, clone], plain);
  await git(clone, ['checkout', '--quiet', '-b', RELEASE_BRANCH], plain);
  await writeFile(join(clone, 'CHANGELOG.md'), '# Changelog\n\n## 1.5.0\n\n- Filter the catalogue by category\n');
  await git(clone, ['add', '--all'], author);
  await git(clone, ['commit', '--quiet', '--message', RELEASE_TITLE], author);
  await git(clone, ['push', '--quiet', 'origin', RELEASE_BRANCH], plain);
  const files = new LocalGitHubFiles(forgeDirectory);
  const number = await files.nextNumber();
  await files.writePullRequestBody(number, 'This pull request prepares release 1.5.0.\n');
  await files.writePullRequest({ number, title: RELEASE_TITLE, head: RELEASE_BRANCH, base: 'main', labels: ['autorelease: pending'], closes: [], state: 'open', author: 'release-bot[bot]', createdAt: new Date().toISOString(), mergeSha: null, mergedAt: null });
}
await openReleasePullRequest();
console.log(`READY ${JSON.stringify({ home })}`);
