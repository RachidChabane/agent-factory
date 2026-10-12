import { CommandClient } from '../data/command-client.ts';
import type { CommandSender } from '../data/command-client.ts';
import { PullRequestDiffs } from '../data/pull-request-diffs.ts';
import { RunLogStore } from '../data/run-log-store.ts';
import { CockpitStore } from '../data/store.ts';
import type { Timers } from '../data/sync-controller.ts';
import { browserTimers, SyncController } from '../data/sync-controller.ts';
import type { CockpitTransport } from '../data/transport.ts';
import type { Clock } from '../model/clock.ts';

export interface RunLogLoader {
  ensureRunLog(runId: string): void;
}

export interface CockpitServices {
  readonly store: CockpitStore;
  readonly runLogs: RunLogStore;
  readonly diffs: PullRequestDiffs;
  readonly loader: RunLogLoader;
  readonly commands: CommandSender;
  readonly clock: Clock;
  start(): void;
  stop(): void;
}

export interface ServiceOptions {
  readonly transport: CockpitTransport;
  readonly clock: Clock;
  readonly random?: (() => number) | undefined;
  readonly timers?: Timers | undefined;
}

export function createCockpitServices({ transport, clock, random = Math.random, timers = browserTimers }: ServiceOptions): CockpitServices {
  const store = new CockpitStore();
  const runLogs = new RunLogStore();
  const sync = new SyncController({ transport, store, runLogs, clock, random, timers });
  const commands = new CommandClient(transport, () => sync.requestResync());
  return {
    store,
    runLogs,
    diffs: new PullRequestDiffs(transport),
    loader: sync,
    commands,
    clock,
    start: () => sync.start(),
    stop: () => sync.stop(),
  };
}
