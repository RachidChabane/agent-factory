import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PullRequestFeedback } from '@agent-factory/application';
import { issuePipeline } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { runningFactory, withFactoryLock } from './factory-running.ts';
import { itemName, selectedProject, withProjectSession } from './project-session.ts';
import { reportOutcome } from './run-issue-command.ts';

const UTF8 = 'utf8';
const CLI_SOURCE = 'cli';

export async function prFeedbackCommand(pullRequestNumber: number, path: string, author: string, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const body = (await readFile(resolve(context.workingDirectory, path), UTF8)).trim();
  return withProjectSession(context, selected, async ({ installation, project }) => {
    const controller = new AbortController();
    const releaseSignals = abortOnShutdown(controller, context.output);
    try {
      const feedback = new PullRequestFeedback({ ...project.dependencies, clock: installation.clock }, project.settings.implementerEscalation);
      const outcome = await feedback.record({ pullRequestNumber, author, source: CLI_SOURCE, body });
      const issue = itemName(project.config, outcome.issueNumber);
      if (outcome.kind === 'needs-human') {
        context.output.error(`${issue} needs a human: ${outcome.reason}`);
        return EXIT_CODES.needsHuman;
      }
      context.output.line(`Feedback from ${author} recorded on pull request #${pullRequestNumber}; ${issue} re-enters the implementer (attempt ${outcome.attempt + 1})`);
      const running = await runningFactory(selected.config);
      if (running !== null) {
        context.output.line(`The factory running as process ${running} continues it and updates the pull request`);
        return EXIT_CODES.ok;
      }
      return await withFactoryLock(selected.config, async () =>
        reportOutcome(project.config, await issuePipeline(project, controller.signal).runIssue(outcome.issueNumber), context.output),
      );
    } finally {
      releaseSignals();
    }
  });
}
