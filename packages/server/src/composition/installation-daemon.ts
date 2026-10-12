import { InstallationDaemon, MachineSchedulingPauses, ToolSessionKeepers, type FactoryDaemon, type InstallationTask, type PauseSet } from '@agent-factory/application';
import { ConfigurationFileWatch } from './installation/configuration-watch.ts';
import type { InstallationRuntime } from './installation/installation-runtime.ts';
import { projectDaemon, projectScheduler } from './project/project-use-cases.ts';
import { SystemSleeper } from './system.ts';

/** The daemons of a running installation: one per project, driven by one loop. */
export interface RunningDaemons {
  readonly installation: InstallationDaemon;
  project(id: string): FactoryDaemon | null;
}

function healthTasks(runtime: InstallationRuntime): readonly InstallationTask[] {
  return runtime.projects
    .filter((project) => project.config.delivery.environments.some((environment) => environment.health.length > 0))
    .map((project) => ({
      name: `sampling the health of ${project.id}`,
      run: async () => {
        await project.health.sampleIfDue();
      },
    }));
}

const INSTALLATION_SCOPE = 'the installation';

/** One keeper per scope whose tools declare a keep-alive: the installation's, then each project's. */
function toolSessionTasks(runtime: InstallationRuntime): readonly InstallationTask[] {
  const { clock, operator } = runtime;
  const installation = runtime.toolSessions.keptSessions();
  const own =
    installation.length === 0
      ? []
      : [new ToolSessionKeepers({ events: runtime.events, sessions: runtime.toolSessions, prober: runtime.tools, clock, log: runtime.log }, { scope: INSTALLATION_SCOPE, operator, sessions: installation })];
  const projects = runtime.projects.flatMap((project) => {
    const sessions = runtime.projectToolSessions(project.id);
    const kept = sessions.keptSessions();
    if (kept.length === 0) return [];
    const dependencies = { events: project.dependencies.events, sessions, prober: runtime.projectTools(project.id), clock, log: project.log };
    return [new ToolSessionKeepers(dependencies, { scope: project.id, operator, sessions: kept })];
  });
  return [...own, ...projects];
}

export function createDaemons(runtime: InstallationRuntime): RunningDaemons {
  let installation: InstallationDaemon | null = null;
  const currentPauses = (): PauseSet => installation?.currentPauses() ?? new Map();
  const daemons = new Map(runtime.projects.map((project) => [project.id, projectDaemon(project, runtime, currentPauses)]));
  installation = new InstallationDaemon(
    {
      events: runtime.events,
      clock: runtime.clock,
      sleeper: new SystemSleeper(),
      log: runtime.log,
      pauses: new MachineSchedulingPauses({ events: runtime.events, admission: runtime.admission, budget: runtime.budget, notifications: runtime.notifications }),
      configuration: runtime.live,
      tasks: [runtime.usage, new ConfigurationFileWatch(runtime.config.configPath, runtime.events), ...healthTasks(runtime), ...toolSessionTasks(runtime)],
      projects: runtime.projects.flatMap((project) => {
        const daemon = daemons.get(project.id);
        return daemon === undefined ? [] : [projectScheduler(project, daemon)];
      }),
    },
    { pollIntervalMs: runtime.config.daemon.pollIntervalMs },
  );
  const running = installation;
  return { installation: running, project: (id) => daemons.get(id) ?? null };
}
