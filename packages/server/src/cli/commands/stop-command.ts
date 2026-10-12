import { requestDrain } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { runningFactory } from './factory-running.ts';

const OPERATOR_VARIABLE = 'USER';
const UNNAMED_OPERATOR = 'operator';
const STOP_SIGNAL = 'SIGTERM';

/** Stops the factory running on this installation: after its running work by default, at once with `now`. */
export async function stopCommand(now: boolean, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const running = await runningFactory(config);
  if (running === null) {
    context.output.error(`No factory runs on the installation at ${config.home}`);
    return EXIT_CODES.failure;
  }
  if (now) {
    process.kill(running, STOP_SIGNAL);
    context.output.line(`Asked the factory (process ${running}) to stop now: its agents stop, and their issues resume where they were at the next start`);
    return EXIT_CODES.ok;
  }
  const eventLog = context.openEventLog(config);
  try {
    await requestDrain(eventLog.events, context.environment[OPERATOR_VARIABLE] ?? UNNAMED_OPERATOR);
  } finally {
    eventLog.close();
  }
  context.output.line(`The factory (process ${running}) takes no new work and stops once its running work finishes`);
  return EXIT_CODES.ok;
}
