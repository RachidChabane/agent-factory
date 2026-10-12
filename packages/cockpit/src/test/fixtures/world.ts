import type { CockpitSnapshot, PullRequestDiff, RunLogLine } from '../../contract/index.ts';
import { diffKey } from '../fake-transport.ts';
import { activityFeed } from './activity.ts';
import { costsView } from './costs.ts';
import { installationInfo, installationResources, installationSettings, installationTools } from './installation.ts';
import { buildLedger } from './ledger/project.ts';
import { ledgerDiffs } from './ledger/pull-requests.ts';
import { buildRuns } from './runs.ts';
import { buildStorefront } from './storefront/project.ts';
import { storefrontDiffs } from './storefront/pull-requests.ts';
import { fixtureClock } from './time.ts';
import { usageView } from './usage.ts';

export { LEDGER_ID, STOREFRONT_ID } from './project-ids.ts';

export interface FixtureWorld {
  readonly snapshot: CockpitSnapshot;
  readonly logs: ReadonlyMap<string, readonly RunLogLine[]>;
  /** The diffs the factory serves on demand, by `diffKey(project, pullRequestNumber)`. */
  readonly diffs: ReadonlyMap<string, PullRequestDiff>;
}

export const INITIAL_SEQUENCE = 1_842;

/** The whole fictional installation as it is `now`: two projects, their runs, the machine and the accounts. */
export function buildWorld(now: number): FixtureWorld {
  const clock = fixtureClock(now);
  const runs = buildRuns(clock);
  const installation = installationInfo(clock, runs);
  const storefront = buildStorefront(clock, runs);
  const ledger = buildLedger(clock, runs);
  const projects = [storefront, ledger];
  const diffs = new Map<string, PullRequestDiff>([
    ...storefrontDiffs(clock, storefront.pullRequests).map((diff): [string, PullRequestDiff] => [diffKey(storefront.id, diff.pullRequestNumber), diff]),
    ...ledgerDiffs(clock, ledger.pullRequests).map((diff): [string, PullRequestDiff] => [diffKey(ledger.id, diff.pullRequestNumber), diff]),
  ]);
  const usage = usageView(clock);
  const tools = installationTools(clock);
  return {
    snapshot: {
      sequence: INITIAL_SEQUENCE,
      generatedAt: new Date(now).toISOString(),
      installation,
      activity: activityFeed({ installation, projects, runs: runs.runs, tools, usage }, INITIAL_SEQUENCE),
      projects,
      runs: [...runs.runs],
      usage,
      costs: costsView(clock, runs),
      resources: installationResources(clock),
      tools,
      settings: installationSettings(),
    },
    logs: runs.logs,
    diffs,
  };
}
