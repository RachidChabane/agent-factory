import type { InstallationInfo, InstallationSettingsView, ResourcesView, ToolView } from '../../contract/index.ts';
import { FACTORY_PUBLIC_URL, FACTORY_VERSION, MODELS, OPERATOR } from './people.ts';
import { toolView } from './project-parts.ts';
import { readOn } from './readings.ts';
import { ROLE_SETTINGS } from './roles.ts';
import type { RunWorld } from './runs.ts';
import type { FixtureClock } from './time.ts';

const MAX_CONCURRENT_RUNS = 3;
const MINIMUM_FREE_MEMORY_PERCENT = 40;
const QUEUED_RUNS = 1;

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/** How old a reading of each kind may be before the cockpit calls it stale. */
export const STALE_AFTER_MS = {
  forge: 15 * MINUTE,
  health: 10 * MINUTE,
  resources: 2 * MINUTE,
  tools: 12 * 60 * MINUTE,
  knowledge: 15 * MINUTE,
} as const;

const RESOURCE_PAUSE_MINUTES_AGO = 25;
const LOW_MEMORY_PERCENT = 31;
const FREE_MEMORY_PERCENT = 63;
const SAMPLE_SECONDS_AGO = 12;
const TOOL_CHECK_MINUTES_AGO = 95;
const STALE_TOOL_CHECK_HOURS_AGO = 20;
const DAEMON_STARTED_HOURS_AGO = 4 * 24 + 6;

export const CONFIGURATION_PATH = '/srv/example-org/factory/config.yaml';

function liveRunCount(runs: RunWorld): number {
  return runs.runs.filter((run) => run.status === 'running' || run.status === 'waiting').length;
}

export function installationInfo(clock: FixtureClock, runs: RunWorld): InstallationInfo {
  return {
    version: FACTORY_VERSION,
    mode: 'live',
    operator: OPERATOR.name,
    publicUrl: FACTORY_PUBLIC_URL,
    startedAt: clock.hoursAgo(DAEMON_STARTED_HOURS_AGO),
    pauses: [
      {
        scope: 'installation',
        cause: 'resources',
        reason: `free memory ${LOW_MEMORY_PERCENT}% is below ${MINIMUM_FREE_MEMORY_PERCENT}%`,
        since: clock.minutesAgo(RESOURCE_PAUSE_MINUTES_AGO),
        resumesAt: null,
      },
    ],
    runSlots: { limit: MAX_CONCURRENT_RUNS, running: liveRunCount(runs), queued: QUEUED_RUNS },
    staleAfterMs: { ...STALE_AFTER_MS },
  };
}

export function installationTools(clock: FixtureClock): ToolView[] {
  const checkedAt = clock.minutesAgo(TOOL_CHECK_MINUTES_AGO);
  return [
    toolView({ name: 'git', scope: 'installation', builtIn: true, description: 'Version control', status: 'connected', version: 'git version 2.51.0', detail: 'git is installed', checkedAt }),
    toolView({
      name: 'claude',
      scope: 'installation',
      builtIn: true,
      description: 'Claude Code command line',
      status: 'connected',
      version: '2.4.0 (Claude Code)',
      detail: '2.4.0 (Claude Code)',
      installHint: 'claude install 2.4.0',
      checkedAt,
    }),
    toolView({
      name: 'sandbox',
      scope: 'installation',
      builtIn: true,
      description: 'Confinement of the setup and gate commands',
      status: 'connected',
      detail: 'setup and gate commands run confined: no credential reads, no writes outside their worktree, no network unless declared',
      checkedAt,
    }),
    toolView({
      name: 'tailscale',
      scope: 'installation',
      builtIn: false,
      description: 'Remote access to the cockpit',
      status: 'connected',
      version: '1.88.2',
      detail: 'Connected to the network of example-org as factory-host',
      installHint: 'brew install tailscale',
      checkedAt: clock.hoursAgo(STALE_TOOL_CHECK_HOURS_AGO),
    }),
  ];
}

export function installationResources(clock: FixtureClock): ResourcesView {
  return {
    sample: readOn({ freeMemoryPercent: FREE_MEMORY_PERCENT, pressure: 'normal' }, clock.secondsAgo(SAMPLE_SECONDS_AGO)),
    minimumFreeMemoryPercent: MINIMUM_FREE_MEMORY_PERCENT,
    pauseAbovePressure: 'normal',
    schedulingPaused: true,
  };
}

export function installationSettings(): InstallationSettingsView {
  return {
    models: [...MODELS],
    defaultRoles: ROLE_SETTINGS.map((setting) => ({ ...setting })),
    resources: { minimumFreeMemoryPercent: MINIMUM_FREE_MEMORY_PERCENT, pauseAbovePressure: 'normal', maxConcurrentRuns: MAX_CONCURRENT_RUNS },
    notifications: [
      { kind: 'system', configured: true },
      { kind: 'slack', configured: true },
      { kind: 'google-chat', configured: false },
      { kind: 'webhook', configured: true },
    ],
    remoteAccess: 'tailscale',
    configuration: { path: CONFIGURATION_PATH, restartRequired: [], reloadFailure: null },
  };
}
