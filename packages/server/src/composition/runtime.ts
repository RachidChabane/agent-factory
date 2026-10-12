import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { dispatchCommand } from '../http/commands.ts';
import type { EventStreamSettings } from '../http/event-stream.ts';
import { DEFAULT_STREAM_SETTINGS, FactoryHttpServer } from '../http/factory-http-server.ts';
import { SequenceCursor } from '../http/sequence-cursor.ts';
import { SnapshotSource } from '../snapshot/snapshot-source.ts';
import { createDaemons, type RunningDaemons } from './installation-daemon.ts';
import type { InstallationRuntime } from './installation/installation-runtime.ts';
import { FACTORY_INSTALL_DIRECTORY } from './install-paths.ts';

export const FACTORY_LOCK_FILE = 'factory.lock';
export const COCKPIT_DIST_DIRECTORY = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'cockpit', 'dist');

export function factoryLockPath(stateDirectory: string): string {
  return join(stateDirectory, FACTORY_LOCK_FILE);
}

export interface RuntimeOptions {
  readonly stream?: EventStreamSettings;
  readonly cockpitDirectory?: string;
}

export interface RunningFactory {
  readonly address: AddressInfo;
  readonly daemons: RunningDaemons;
  readonly server: FactoryHttpServer;
  /** Settles once the daemons have stopped and the server is closed. */
  readonly finished: Promise<void>;
}

/** The cockpit's HTTP server over an installation; without daemons, commands that need a running factory are refused. */
export function createHttpServer(runtime: InstallationRuntime, daemons: RunningDaemons | null, options: RuntimeOptions = {}): FactoryHttpServer {
  const source = new SnapshotSource(runtime);
  const cursor = new SequenceCursor(runtime.events);
  const { config } = runtime;
  return new FactoryHttpServer(
    {
      events: runtime.events,
      runLogs: runtime.runLogs,
      log: runtime.log,
      snapshot: () => source.snapshot(),
      telemetry: () => source.telemetry(),
      command: (name, body, operator) => dispatchCommand(name, body, { runtime, daemons, operator }, cursor),
    },
    {
      host: config.server.host,
      port: config.server.port,
      remoteAccess: config.server.remoteAccess,
      projectDirectories: (id) => {
        const project = runtime.projects.find((candidate) => candidate.id === id);
        if (project === undefined) return null;
        const { directories, forge } = project.config;
        return { evidence: directories.evidence, requests: directories.requests, forge: forge.kind === 'local' ? forge.directory : null };
      },
      cockpitDirectory: options.cockpitDirectory ?? COCKPIT_DIST_DIRECTORY,
      stream: options.stream ?? DEFAULT_STREAM_SETTINGS,
    },
  );
}

/** Starts the daemons of every project and the cockpit; aborting the signal stops both. */
export async function startFactory(runtime: InstallationRuntime, signal: AbortSignal, options: RuntimeOptions = {}): Promise<RunningFactory> {
  const daemons = createDaemons(runtime);
  const server = createHttpServer(runtime, daemons, options);
  const address = await server.start();
  runtime.listeningPorts.register(address.port);
  const finished = daemons.installation.run(signal).finally(() => server.stop());
  return { address, daemons, server, finished };
}
