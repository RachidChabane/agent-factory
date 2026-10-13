import type { Sleeper } from '@agent-factory/application';
import { serverClientUrl, withServerPort } from '../../config/agent-factory-config.ts';
import { SystemSleeper } from '../../composition/system.ts';
import { FileBlockerMemory } from '../../watch/file-blocker-memory.ts';
import { HttpSnapshotSource } from '../../watch/snapshot-source.ts';
import { transitionJson, transitionLine } from '../../watch/transition-lines.ts';
import { WatchLoop, type TransitionSink } from '../../watch/watch-loop.ts';
import { watchSettings } from '../../watch/watch-settings.ts';
import type { CliContext } from '../cli-context.ts';
import type { CliCommand } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';

type WatchCommand = Extract<CliCommand, { readonly kind: 'watch' }>;

/** What the watch needs from the machine beyond the command-line context. */
export interface WatchPorts {
  readonly sleeper: Sleeper;
  readonly fetcher: typeof fetch;
}

export function systemWatchPorts(): WatchPorts {
  return { sleeper: new SystemSleeper(), fetcher: fetch };
}

function sinkFor(command: WatchCommand, context: CliContext): TransitionSink {
  const render = command.json ? transitionJson : transitionLine;
  return { emit: (at, transition) => context.output.line(render(at, transition)) };
}

/**
 * Prints one line for each blocker of the running factory that appears or clears since the last watch reported, until
 * stopped, and keeps what it reported in the state directory so that a restart repeats nothing; `--all` reports every blocker
 * present first. With `--once`, it prints that report once without changing what was kept, and exits 1 when anything blocks
 * work now.
 */
export async function watchCommand(command: WatchCommand, context: CliContext, ports: WatchPorts = systemWatchPorts()): Promise<number> {
  const config = await context.loadConfig();
  const server = (command.port === null ? config : withServerPort(config, command.port)).server;
  const loop = new WatchLoop(
    {
      source: new HttpSnapshotSource(serverClientUrl(server), ports.fetcher),
      memory: new FileBlockerMemory(config.directories.state),
      clock: context.clock,
      sleeper: ports.sleeper,
      sink: sinkFor(command, context),
    },
    watchSettings(command.intervalSeconds, command.all),
  );
  const controller = new AbortController();
  const releaseSignals = abortOnShutdown(controller, context.output);
  try {
    if (command.once) return (await loop.readOnce(controller.signal)).length === 0 ? EXIT_CODES.ok : EXIT_CODES.failure;
    await loop.run(controller.signal);
    return EXIT_CODES.ok;
  } finally {
    releaseSignals();
  }
}
