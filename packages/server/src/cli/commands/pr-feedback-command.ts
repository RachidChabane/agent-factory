import { readFile } from 'node:fs/promises';
import { PullRequestFeedback } from '@agent-factory/application';
import { issuePipeline } from '../../composition/use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { runningFactory, withFactoryLock } from './factory-running.ts';
import { reportOutcome } from './run-issue-command.ts';

const UTF8 = 'utf8';
const CLI_SOURCE = 'cli';

export async function prFeedbackCommand(pullRequestNumber: number, path: string, author: string, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const body = (await readFile(path, UTF8)).trim();
  const factory = await context.openFactory(config);
  const controller = new AbortController();
  const releaseSignals = abortOnShutdown(controller, context.output);
  try {
    const feedback = new PullRequestFeedback({ ...factory.dependencies, clock: factory.clock }, factory.settings.implementerEscalation);
    const outcome = await feedback.record({ pullRequestNumber, author, source: CLI_SOURCE, body });
    if (outcome.kind === 'needs-human') {
      context.output.error(`Issue #${outcome.issueNumber} needs a human: ${outcome.reason}`);
      return EXIT_CODES.needsHuman;
    }
    context.output.line(`Feedback from ${author} recorded on pull request #${pullRequestNumber}; issue #${outcome.issueNumber} re-enters the implementer (attempt ${outcome.attempt + 1})`);
    const running = await runningFactory(config);
    if (running !== null) {
      context.output.line(`The factory running as process ${running} continues it and updates the pull request`);
      return EXIT_CODES.ok;
    }
    return await withFactoryLock(config, async () =>
      reportOutcome(await issuePipeline(factory, controller.signal).runIssue(outcome.issueNumber), context.output),
    );
  } finally {
    releaseSignals();
    factory.close();
  }
}
