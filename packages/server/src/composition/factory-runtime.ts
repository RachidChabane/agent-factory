import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FactoryDaemon } from '@agent-factory/application';
import type { FactoryConfig } from '../config/factory-config.ts';
import { dispatchCommand } from '../http/commands.ts';
import { DEFAULT_STREAM_SETTINGS, FactoryHttpServer } from '../http/factory-http-server.ts';
import type { EventStreamSettings } from '../http/event-stream.ts';
import { SequenceCursor } from '../http/sequence-cursor.ts';
import { SnapshotSource } from '../http/snapshot-source.ts';
import type { FactoryContainer } from './factory-container.ts';
import { FACTORY_INSTALL_DIRECTORY } from './install-paths.ts';
import { createDaemon } from './use-cases.ts';

export const FACTORY_LOCK_FILE = 'factory.lock';
export const COCKPIT_DIST_DIRECTORY = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'cockpit', 'dist');

export function factoryLockPath(config: FactoryConfig): string {
  return join(config.directories.state, FACTORY_LOCK_FILE);
}

export interface RuntimeOptions {
  readonly daemon?: FactoryDaemon;
  readonly stream?: EventStreamSettings;
  readonly cockpitDirectory?: string;
}

export interface FactoryRuntime {
  readonly address: AddressInfo;
  readonly daemon: FactoryDaemon;
  readonly server: FactoryHttpServer;
  readonly finished: Promise<void>;
}

export function createHttpServer(factory: FactoryContainer, daemon: FactoryDaemon | null, options: RuntimeOptions = {}): FactoryHttpServer {
  const source = new SnapshotSource(factory);
  const cursor = new SequenceCursor(factory.dependencies.events);
  const { config } = factory;
  return new FactoryHttpServer(
    {
      events: factory.dependencies.events,
      runLogs: factory.runLogs,
      log: factory.log,
      snapshot: () => source.snapshot(),
      telemetry: () => source.telemetry(),
      command: (name, body, operator) => dispatchCommand(name, body, { factory, daemon, operator }, cursor),
    },
    {
      host: config.server.host,
      port: config.server.port,
      tailnet: config.server.tailnet,
      evidenceDirectory: config.directories.evidence,
      requestsDirectory: config.directories.requests,
      cockpitDirectory: options.cockpitDirectory ?? COCKPIT_DIST_DIRECTORY,
      stream: options.stream ?? DEFAULT_STREAM_SETTINGS,
    },
  );
}

export async function startFactoryRuntime(factory: FactoryContainer, signal: AbortSignal, options: RuntimeOptions = {}): Promise<FactoryRuntime> {
  const daemon = options.daemon ?? createDaemon(factory);
  const server = createHttpServer(factory, daemon, options);
  const address = await server.start();
  factory.listeningPorts.register(address.port);
  const finished = daemon.run(signal).finally(() => server.stop());
  return { address, daemon, server, finished };
}
