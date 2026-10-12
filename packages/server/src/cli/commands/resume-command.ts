import { issueResumer } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { COMMAND_NAMES } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { runningFactory } from './factory-running.ts';
import { itemName, nextCommand, selectedProject, withProjectSession, type SelectedProject } from './project-session.ts';

export interface ResumeOptions {
  /** The decision the implementer asked for. */
  readonly answer: string | null;
  /** Review the implementation the issue already has once more, instead of returning to the stage it left. */
  readonly reviewAgain: boolean;
}

/** What happens next to an issue that waits for the factory to carry on. */
async function continuation(selected: SelectedProject, issueNumber: number): Promise<string> {
  const running = await runningFactory(selected.config);
  return running === null
    ? `Run "${nextCommand(selected, COMMAND_NAMES.runIssue, String(issueNumber))}" to continue, or start the factory.`
    : `The factory running as process ${running} continues it at its next tick.`;
}

export async function resumeCommand(issueNumber: number, options: ResumeOptions, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  return withProjectSession(context, selected, async ({ installation, project }) => {
    const name = itemName(project.config, issueNumber);
    if (options.reviewAgain) {
      const ordered = await issueResumer(project).reviewAgain(issueNumber, installation.operator);
      context.output.line(
        `${name} returned to reviewing: the implementation of attempt ${ordered.attempt + 1} will be reviewed again. ${await continuation(selected, issueNumber)}`,
      );
      return EXIT_CODES.ok;
    }
    const outcome = await issueResumer(project).resume(issueNumber, options.answer);
    const spec = outcome.specChanged ? 'the clarified spec was recorded' : 'the spec is unchanged';
    const checks = outcome.checksReauthored ? '; the acceptance checks will be written again from the base' : '';
    const decision = outcome.decisionAnswered ? '; the implementer will continue with the answer to its decision request' : '';
    const feedback = outcome.feedbackCycleGranted ? '; one fresh session on the escalation profile addresses the pending feedback' : '';
    context.output.line(`${name} resumed at ${outcome.resumedAt}: ${spec}${checks}${decision}${feedback}. ${await continuation(selected, issueNumber)}`);
    return EXIT_CODES.ok;
  });
}
