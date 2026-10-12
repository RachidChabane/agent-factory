import { issueResumer } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { COMMAND_NAMES } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { runningFactory } from './factory-running.ts';
import { itemName, nextCommand, selectedProject, withProjectSession } from './project-session.ts';

export async function resumeCommand(issueNumber: number, answer: string | null, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  return withProjectSession(context, selected, async ({ project }) => {
    const outcome = await issueResumer(project).resume(issueNumber, answer);
    const spec = outcome.specChanged ? 'the clarified spec was recorded' : 'the spec is unchanged';
    const checks = outcome.checksReauthored ? '; the acceptance checks will be written again from the base' : '';
    const decision = outcome.decisionAnswered ? '; the implementer will continue with the answer to its decision request' : '';
    const feedback = outcome.feedbackCycleGranted ? '; one fresh session on the escalation profile addresses the pending feedback' : '';
    const running = await runningFactory(selected.config);
    const next =
      running === null
        ? `Run "${nextCommand(selected, COMMAND_NAMES.runIssue, String(issueNumber))}" to continue, or start the factory.`
        : `The factory running as process ${running} continues it at its next tick.`;
    context.output.line(`${itemName(project.config, issueNumber)} resumed at ${outcome.resumedAt}: ${spec}${checks}${decision}${feedback}. ${next}`);
    return EXIT_CODES.ok;
  });
}
