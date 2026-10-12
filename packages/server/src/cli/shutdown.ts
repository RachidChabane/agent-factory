import type { CliOutput } from './output.ts';

export const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export function abortOnShutdown(controller: AbortController, output: CliOutput): () => void {
  const handler = (signal: NodeJS.Signals): void => {
    if (controller.signal.aborted) {
      output.error(`${signal} received again; the factory is already stopping its agents and commands`);
      return;
    }
    output.error(`${signal} received; stopping`);
    controller.abort();
  };
  for (const signal of SHUTDOWN_SIGNALS) process.on(signal, handler);
  return () => {
    for (const signal of SHUTDOWN_SIGNALS) process.off(signal, handler);
  };
}
