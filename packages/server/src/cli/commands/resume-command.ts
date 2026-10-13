import type { Delegation } from '@agent-factory/application';
import { issueResumer } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { COMMAND_NAMES } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { authorisedDelegate, recordDelegation, refuseDelegation } from './delegated-gestures.ts';
import { runningFactory } from './factory-running.ts';
import { itemName, nextCommand, selectedProject, withProjectSession, type SelectedProject } from './project-session.ts';

export interface ResumeOptions {
  /** The decision the implementer asked for. */
  readonly answer: string | null;
  /** Review the implementation the issue already has once more, instead of returning to the stage it left. */
  readonly reviewAgain: boolean;
  /** The delegate making the gesture; null when the operator resumes the issue themselves. */
  readonly delegation: Delegation | null;
}

/** What happens next to an issue that waits for the factory to carry on. */
async function continuation(selected: SelectedProject, issueNumber: number): Promise<string> {
  const running = await runningFactory(selected.config);
  return running === null
    ? `Run "${nextCommand(selected, COMMAND_NAMES.runIssue, String(issueNumber))}" to continue, or start the factory.`
    : `The factory running as process ${running} continues it at its next tick.`;
}

/** Orders a new review of the implementation the issue has: the operator's alone, since no policy delegates it. */
async function reviewAgainCommand(issueNumber: number, delegation: Delegation | null, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  refuseDelegation(selected.project, delegation, 'review-again');
  return withProjectSession(context, selected, async ({ installation, project }) => {
    const ordered = await issueResumer(project).reviewAgain(issueNumber, installation.operator);
    context.output.line(
      `${itemName(project.config, issueNumber)} returned to reviewing: the implementation of attempt ${ordered.attempt + 1} will be reviewed again. ${await continuation(selected, issueNumber)}`,
    );
    return EXIT_CODES.ok;
  });
}

/** Resumes an escalated issue, with the answer to its decision when it asked for one: the operator's gesture, or the delegate's when `--as` names it. */
async function returnCommand(issueNumber: number, answer: string | null, delegation: Delegation | null, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const authorisation = authorisedDelegate(selected.project, delegation, answer === null ? 'resume' : 'answer-decision');
  return withProjectSession(context, selected, async (session) => {
    const { project } = session;
    const outcome = await issueResumer(project).resume(issueNumber, answer, delegation);
    const spec = outcome.specChanged ? 'the clarified spec was recorded' : 'the spec is unchanged';
    const checks = outcome.checksReauthored ? '; the acceptance checks will be written again from the base' : '';
    const decision = outcome.decisionAnswered ? '; the implementer will continue with the answer to its decision request' : '';
    context.output.line(`${itemName(project.config, issueNumber)} resumed at ${outcome.resumedAt}: ${spec}${checks}${decision}. ${await continuation(selected, issueNumber)}`);
    await recordDelegation(session, context, delegation, authorisation, { kind: 'issue', number: issueNumber, issueNumber });
    return EXIT_CODES.ok;
  });
}

export function resumeCommand(issueNumber: number, options: ResumeOptions, requested: string | null, context: CliContext): Promise<number> {
  return options.reviewAgain
    ? reviewAgainCommand(issueNumber, options.delegation, requested, context)
    : returnCommand(issueNumber, options.answer, options.delegation, requested, context);
}
