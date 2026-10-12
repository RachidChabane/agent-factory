import { CommandClient } from '../data/command-client.ts';
import type { CommandSender } from '../data/command-client.ts';
import { RunLogStore } from '../data/run-log-store.ts';
import { CockpitStore } from '../data/store.ts';
import type { Timers } from '../data/sync-controller.ts';
import { browserTimers, SyncController } from '../data/sync-controller.ts';
import type { CockpitTransport } from '../data/transport.ts';
import type { Clock } from '../model/clock.ts';

export const COCKPIT_MODES = ['live', 'mock'] as const;
export type CockpitMode = (typeof COCKPIT_MODES)[number];

export interface RunLogLoader {
  ensureRunLog(runId: string): void;
}

export interface CockpitServices {
  readonly mode: CockpitMode;
  readonly store: CockpitStore;
  readonly runLogs: RunLogStore;
  readonly loader: RunLogLoader;
  readonly commands: CommandSender;
  readonly clock: Clock;
  start(): void;
  stop(): void;
}

export interface ServiceOptions {
  readonly transport: CockpitTransport;
  readonly clock: Clock;
  readonly mode: CockpitMode;
  readonly random?: (() => number) | undefined;
  readonly timers?: Timers | undefined;
}

export function createCockpitServices({ transport, clock, mode, random = Math.random, timers = browserTimers }: ServiceOptions): CockpitServices {
  const store = new CockpitStore();
  const runLogs = new RunLogStore();
  const sync = new SyncController({ transport, store, runLogs, clock, random, timers });
  const commands = new CommandClient(transport, () => sync.requestResync());
  return {
    mode,
    store,
    runLogs,
    loader: sync,
    commands,
    clock,
    start: () => sync.start(),
    stop: () => sync.stop(),
  };
}
