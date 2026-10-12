import type { Delegation } from '@agent-factory/application';
import { issueResumer } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { COMMAND_NAMES } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { authorisedDelegate, recordDelegation } from './delegated-gestures.ts';
import { runningFactory } from './factory-running.ts';
import { itemName, nextCommand, selectedProject, withProjectSession } from './project-session.ts';

/** Resumes an escalated issue, with the answer to its decision when it asked for one: the operator's gesture, or the delegate's when `--as` names it. */
export async function resumeCommand(issueNumber: number, answer: string | null, delegation: Delegation | null, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const authorisation = authorisedDelegate(selected.project, delegation, answer === null ? 'resume' : 'answer-decision');
  return withProjectSession(context, selected, async (session) => {
    const { project } = session;
    const outcome = await issueResumer(project).resume(issueNumber, answer, delegation);
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
    await recordDelegation(session, context, delegation, authorisation, { kind: 'issue', number: issueNumber, issueNumber });
    return EXIT_CODES.ok;
  });
}
