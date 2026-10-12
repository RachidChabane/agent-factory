import { usageView } from '../../projections/installation-views.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { renderUsage } from '../usage-view.ts';

const FIRST_SEQUENCE = 0;
const EVERY_SUBJECT = '';

/** Prints each account's subscription usage; with a refresh, reads it from Claude first, which costs no usage. */
export async function usageCommand(refresh: boolean, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const installation = await context.openInstallation(config, { projects: [] });
  const controller = new AbortController();
  const releaseSignals = abortOnShutdown(controller, context.output);
  try {
    const usage = refresh ? await installation.usage.refreshNow(controller.signal) : await installation.budget.usage();
    const records = await installation.events.read(EVERY_SUBJECT, FIRST_SEQUENCE);
    const view = usageView(config, usage, records);
    for (const line of renderUsage(view, context.clock.now())) context.output.line(line);
    const failed = refresh && view.accounts.some((account) => account.lastFailure !== null && (account.readAt === null || account.lastFailure.at > account.readAt));
    return failed ? EXIT_CODES.failure : EXIT_CODES.ok;
  } finally {
    releaseSignals();
    installation.close();
  }
}
