import { InstallationDaemon, MachineSchedulingPauses, type FactoryDaemon, type InstallationTask, type PauseSet } from '@agent-factory/application';
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
      tasks: [runtime.usage, new ConfigurationFileWatch(runtime.config.configPath, runtime.events), ...healthTasks(runtime)],
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
