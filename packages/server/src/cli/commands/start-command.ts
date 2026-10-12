import { ProcessLock } from '@agent-factory/adapters';
import { withServerPort, type AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import type { InstallationOverrides, InstallationRuntime } from '../../composition/installation/installation-runtime.ts';
import { factoryLockPath, startFactory, type RunningFactory } from '../../composition/runtime.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { requireProjectReferences } from './project-references.ts';

/** What runs beside the factory once it serves, such as the demonstration's own activity; it ends when the signal aborts. */
export type CompanionTask = (runtime: InstallationRuntime, running: RunningFactory, signal: AbortSignal) => Promise<void>;

/**
 * Runs the factory on every project of the configuration and serves the cockpit until a shutdown signal. The snapshots of the
 * projects' references are brought up to date first, and the factory does not start when one cannot be.
 */
export async function serveInstallation(config: AgentFactoryConfig, overrides: InstallationOverrides, context: CliContext, companion: CompanionTask | null = null): Promise<number> {
  const lock = new ProcessLock(factoryLockPath(config.directories.state));
  await lock.acquire();
  const controller = new AbortController();
  const releaseSignals = abortOnShutdown(controller, context.output);
  try {
    await requireProjectReferences(context, config.projects);
    const runtime = await context.openInstallation(config, overrides);
    try {
      const running = await startFactory(runtime, controller.signal, { warmSnapshot: true });
      const projects = runtime.projects.map((project) => project.id).join(', ');
      context.output.line(`Factory started on ${projects}; cockpit at http://${running.address.address}:${running.address.port} (${config.server.publicUrl})`);
      const companionDone = companion === null ? Promise.resolve() : companion(runtime, running, controller.signal);
      await running.finished;
      await companionDone;
      context.output.line('Factory stopped');
      return EXIT_CODES.ok;
    } finally {
      runtime.close();
    }
  } finally {
    releaseSignals();
    await lock.release();
  }
}

/** Starts the factory of the operator's configuration; a port given on the command line replaces the configured one. */
export async function startCommand(context: CliContext, port: number | null): Promise<number> {
  const config = await context.loadConfig();
  return serveInstallation(port === null ? config : withServerPort(config, port), {}, context);
}
