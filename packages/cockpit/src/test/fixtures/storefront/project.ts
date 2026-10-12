import type { KnowledgeSourceView, ProjectView, ToolView } from '../../../contract/index.ts';
import { STOREFRONT_FORGE_URL } from '../forge-links.ts';
import { command, issueTypeInfos, newestFirst, oldestFirstByNumber, projectSettings, toolView } from '../project-parts.ts';
import { STOREFRONT_ID } from '../project-ids.ts';
import { failedAfter, NEVER_READ, readOn } from '../readings.ts';
import type { RunWorld } from '../runs.ts';
import { hours, type FixtureClock } from '../time.ts';
import { DEPENDENCY_AUTOMATION, DOCS_AUTOMATION, storefrontAudits, storefrontSkippedChanges } from './audits.ts';
import { storefrontEnvironments, storefrontWorkflowRuns } from './delivery.ts';
import { activeIssues } from './issues-active.ts';
import { deliveredIssues } from './issues-delivered.ts';
import { storefrontPullRequests } from './pull-requests.ts';
import { storefrontReferences } from './references.ts';
import { storefrontReleases } from './releases.ts';
import { storefrontRequests } from './requests.ts';
import { DEPENDENCY_BOT_LOGIN, OPERATOR } from '../people.ts';

const TOOL_CHECK_MINUTES_AGO = 95;
const GH_LOGIN_DAYS_AGO = 9;
const GH_KEEP_ALIVE_MINUTES = 60;
const GH_KEEP_ALIVE_MINUTES_AGO = 20;
const REGISTRY_LOGIN_HOURS_AGO = 30;
const INFRA_KEEP_ALIVE_MINUTES = 15;
/** Who a scheduled keep-alive run is recorded under. */
const FACTORY_SCHEDULER = 'factory';
const WORKFLOWS_READ_MINUTES_AGO = 4;
const DOCS_READ_MINUTES_AGO = 5;
const DESIGN_SYSTEM_READ_HOURS_AGO = 2;

function knowledge(clock: FixtureClock): KnowledgeSourceView[] {
  return [
    {
      kind: 'path',
      location: 'docs/',
      documents: readOn(
        [
          { path: 'docs/development/local-setup.md', title: 'Local development setup', bytes: 1_480 },
          { path: 'docs/architecture/orders.md', title: 'Orders and their statuses', bytes: 5_230 },
          { path: 'docs/product/promo-codes.md', title: 'Promo code rules', bytes: 3_120 },
          { path: 'docs/product/delivery.md', title: 'Delivery estimates', bytes: 2_760 },
        ],
        clock.minutesAgo(DOCS_READ_MINUTES_AGO),
      ),
    },
    {
      kind: 'repository',
      location: '../storefront-design-system',
      documents: failedAfter(
        readOn(
          [
            { path: 'README.md', title: 'Design system overview', bytes: 2_040 },
            { path: 'docs/forms.md', title: 'Forms and error messages', bytes: 4_410 },
          ],
          clock.minutesAgo(hours(DESIGN_SYSTEM_READ_HOURS_AGO)),
        ),
        'git fetch failed: could not resolve host registry.invalid',
      ),
    },
    { kind: 'path', location: 'adr/', documents: NEVER_READ },
  ];
}

function tools(clock: FixtureClock): ToolView[] {
  const checkedAt = clock.minutesAgo(TOOL_CHECK_MINUTES_AGO);
  return [
    toolView({
      name: 'gh',
      scope: 'project',
      builtIn: true,
      description: 'GitHub command line',
      status: 'connected',
      version: 'gh version 2.81.0',
      detail: 'Logged in to github.example.com account amorgan',
      installHint: 'brew install gh',
      checkedAt,
      loginCommand: 'gh auth login --web',
      lastLogin: { at: clock.daysAgo(GH_LOGIN_DAYS_AGO), outcome: 'succeeded', detail: 'exit code 0 after 41 s', operator: OPERATOR.name },
      keepAlive: {
        command: 'gh auth status',
        everyMinutes: GH_KEEP_ALIVE_MINUTES,
        last: { at: clock.minutesAgo(GH_KEEP_ALIVE_MINUTES_AGO), outcome: 'succeeded', detail: 'exit code 0 after 1 s', operator: FACTORY_SCHEDULER },
      },
    }),
    toolView({ name: 'pnpm', scope: 'project', builtIn: false, description: 'Package manager of the repository', status: 'connected', version: '10.32.1', detail: 'pnpm is installed', checkedAt }),
    toolView({
      name: 'playwright',
      scope: 'project',
      builtIn: false,
      description: 'Browsers used by the end-to-end checks',
      status: 'missing',
      detail: 'chromium is not installed for this version of Playwright',
      installHint: 'pnpm --filter web exec playwright install chromium',
      checkedAt,
    }),
    toolView({
      name: 'registry-login',
      scope: 'project',
      builtIn: false,
      description: 'Login to the private package registry',
      status: 'unauthenticated',
      version: '10.32.1',
      detail: 'E401: your authentication token is missing or has expired',
      fixCommand: 'pnpm login --registry https://registry.example.com',
      installHint: 'brew install pnpm',
      checkedAt,
      loginCommand: 'pnpm login --registry https://registry.example.com',
      lastLogin: { at: clock.hoursAgo(REGISTRY_LOGIN_HOURS_AGO), outcome: 'timed-out', detail: 'the login was not completed within 5 minutes', operator: OPERATOR.name },
    }),
    toolView({ name: 'lighthouse', scope: 'project', builtIn: false, description: 'Performance budget of the product pages', status: 'error', detail: 'The check did not finish within 20 seconds', checkedAt }),
    toolView({
      name: 'infra-plan',
      scope: 'project',
      builtIn: false,
      description: 'Plan of the infrastructure changes',
      installHint: 'brew install terraform',
      loginCommand: 'infra-plan login',
      keepAlive: { command: 'infra-plan whoami', everyMinutes: INFRA_KEEP_ALIVE_MINUTES, last: null },
    }),
  ];
}

export function buildStorefront(clock: FixtureClock, runs: RunWorld): ProjectView {
  const audits = newestFirst(storefrontAudits(clock), (audit) => audit.detectedAt);
  const pullRequests = oldestFirstByNumber(storefrontPullRequests(clock, runs));
  return {
    id: STOREFRONT_ID,
    name: 'Storefront',
    repository: 'example-org/storefront',
    forge: { kind: 'github', url: STOREFRONT_FORGE_URL },
    baseBranch: 'main',
    pauses: [],
    issueTypes: issueTypeInfos(null),
    requests: newestFirst(storefrontRequests(clock, runs), (request) => request.receivedAt),
    issues: oldestFirstByNumber([...deliveredIssues(clock, runs), ...activeIssues(clock, runs)]),
    pullRequests,
    workflows: readOn(storefrontWorkflowRuns(clock), clock.minutesAgo(WORKFLOWS_READ_MINUTES_AGO)),
    environments: storefrontEnvironments(clock),
    releases: storefrontReleases(clock, audits, pullRequests),
    audits,
    skippedChanges: newestFirst(storefrontSkippedChanges(clock), (change) => change.recordedAt),
    knowledge: knowledge(clock),
    references: storefrontReferences(clock),
    tools: tools(clock),
    settings: projectSettings({
      overriddenPrompts: ['implementer', 'challenger'],
      concurrency: { issues: 2, ceiling: 3 },
      setup: [command('install', 'pnpm install --frozen-lockfile', 'downloads the packages from the private registry'), command('build-shared', 'pnpm --filter shared build')],
      beforeAcceptance: [command('lint', 'pnpm lint'), command('typecheck', 'pnpm typecheck')],
      afterAcceptance: [command('unit-tests', 'pnpm test'), command('build', 'pnpm build')],
      environmentVariables: ['NODE_ENV', 'CI', 'PLAYWRIGHT_BROWSERS_PATH', 'STOREFRONT_REGION'],
      automations: [
        { name: DEPENDENCY_AUTOMATION, branches: ['dependency-bot/**'], authors: [DEPENDENCY_BOT_LOGIN] },
        { name: DOCS_AUTOMATION, branches: ['docs-sync/**'], authors: [] },
      ],
      releaseModel: 'release-please',
    }),
  };
}
