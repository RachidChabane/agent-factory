import type { EnvironmentView, HealthSample, KnowledgeSourceView, PauseView, ProjectView, ToolView } from '../../../contract/index.ts';
import { environmentView } from '../seeds.ts';
import { command, issueTypeInfos, newestFirst, oldestFirstByNumber, projectSettings, toolView } from '../project-parts.ts';
import { LEDGER_ID } from '../project-ids.ts';
import { readOn } from '../readings.ts';
import type { RunWorld } from '../runs.ts';
import { hours, type FixtureClock } from '../time.ts';
import { ledgerAudits } from './audits.ts';
import { ledgerIssues } from './issues.ts';
import { ledgerPullRequests } from './pull-requests.ts';
import { ledgerReleases } from './releases.ts';
import { ledgerRequests } from './requests.ts';

const LEDGER_ISSUE_TYPES: readonly string[] = ['feature', 'fix', 'api', 'security', 'docs', 'refactor'];
const SAMPLES_PER_DAY = 24;
const PRODUCTION_HEALTH_URL = 'https://api.ledger.example.com/healthz';
const TOOL_CHECK_MINUTES_AGO = 95;
const DOCS_READ_MINUTES_AGO = 6;
const DEPLOYMENTS_READ_MINUTES_AGO = 6;
const PROBE_MINUTES_AGO = 4;
const PAUSED_MINUTES_AGO = 180;

/** Nothing listens on the production address yet, so every probe is refused. */
function refusedProbes(clock: FixtureClock): HealthSample[] {
  return Array.from({ length: SAMPLES_PER_DAY }, (_, index) => ({
    at: clock.minutesAgo(PROBE_MINUTES_AGO + hours(SAMPLES_PER_DAY - 1 - index)),
    ok: false,
    statusCode: null,
    latencyMs: null,
    detail: 'Connection refused',
  }));
}

function environments(clock: FixtureClock): EnvironmentView[] {
  const probes = refusedProbes(clock);
  return [
    environmentView({ name: 'staging', promotion: 'manual', status: 'unknown', deployments: null }),
    environmentView({
      name: 'production',
      production: true,
      promotion: 'manual',
      status: 'down',
      deployments: readOn({ current: null, history: [], pending: null }, clock.minutesAgo(DEPLOYMENTS_READ_MINUTES_AGO)),
      health: [{ name: 'api', url: PRODUCTION_HEALTH_URL, latest: probes.at(-1) ?? null, series: probes }],
    }),
  ];
}

function knowledge(clock: FixtureClock): KnowledgeSourceView[] {
  return [
    {
      kind: 'path',
      location: 'docs/',
      documents: readOn(
        [
          { path: 'docs/invoice-lifecycle.md', title: 'Invoice lifecycle', bytes: 2_310 },
          { path: 'docs/api/payments.md', title: 'Payments API', bytes: 4_870 },
        ],
        clock.minutesAgo(DOCS_READ_MINUTES_AGO),
      ),
    },
  ];
}

function tools(clock: FixtureClock): ToolView[] {
  const checkedAt = clock.minutesAgo(TOOL_CHECK_MINUTES_AGO);
  return [
    toolView({ name: 'uv', scope: 'project', builtIn: false, description: 'Python package and environment manager', status: 'connected', version: 'uv 0.9.4', detail: 'uv is installed', checkedAt }),
    toolView({
      name: 'psql',
      scope: 'project',
      builtIn: false,
      description: 'PostgreSQL client used by the migration checks',
      status: 'missing',
      detail: 'psql was not found on the PATH',
      installHint: 'brew install libpq',
      checkedAt,
    }),
  ];
}

function pauses(clock: FixtureClock): PauseView[] {
  return [
    {
      scope: 'project',
      cause: 'operator',
      reason: 'Paused by Alex Morgan to review the payment retries before anything else runs.',
      since: clock.minutesAgo(PAUSED_MINUTES_AGO),
      resumesAt: null,
    },
  ];
}

export function buildLedger(clock: FixtureClock, runs: RunWorld): ProjectView {
  const audits = newestFirst(ledgerAudits(clock), (audit) => audit.detectedAt);
  const pullRequests = oldestFirstByNumber(ledgerPullRequests(clock, runs));
  return {
    id: LEDGER_ID,
    name: 'Ledger',
    repository: 'example-org/ledger',
    forge: { kind: 'local', url: null },
    baseBranch: 'main',
    pauses: pauses(clock),
    scheduler: { worktreeShortage: null },
    issueTypes: issueTypeInfos(LEDGER_ISSUE_TYPES),
    requests: newestFirst(ledgerRequests(clock, runs), (request) => request.receivedAt),
    issues: oldestFirstByNumber(ledgerIssues(clock, runs)),
    pullRequests,
    workflows: null,
    environments: environments(clock),
    releases: ledgerReleases(clock, audits, pullRequests),
    audits,
    skippedChanges: [],
    knowledge: knowledge(clock),
    references: [],
    tools: tools(clock),
    settings: projectSettings({
      overriddenPrompts: [],
      concurrency: { issues: 1, ceiling: 2 },
      setup: [command('sync', 'uv sync --frozen', 'downloads the packages from the package index')],
      beforeAcceptance: [command('lint', 'uv run ruff check'), command('typecheck', 'uv run mypy src')],
      afterAcceptance: [command('unit-tests', 'uv run pytest -q')],
      environmentVariables: ['LEDGER_ENV', 'TZ'],
      automations: [],
      releaseModel: 'tags',
    }),
    delegatedDecisions: [],
  };
}
