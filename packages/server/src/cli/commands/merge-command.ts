import type { Delegation } from '@agent-factory/application';
import { mergeOnOrder } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { gateOf, recordDelegation } from './delegated-gestures.ts';
import { itemName, selectedProject, withProjectSession } from './project-session.ts';

/**
 * Merges the reviewed head of a pull request: the operator's gesture, or the delegate's when `--as` names it. The
 * policy is checked on what the journal holds before anything is written, and the merge keeps every guard it has.
 */
export async function mergeCommand(pullRequestNumber: number, expectedHeadSha: string, delegation: Delegation | null, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  return withProjectSession(context, selected, async (session) => {
    const { project } = session;
    const authorisation = delegation === null ? null : await gateOf(session).authoriseMerge(delegation, pullRequestNumber);
    const outcome = await mergeOnOrder(project).merge({ pullRequestNumber, expectedHeadSha, ...(delegation === null ? {} : { delegation }) });
    context.output.line(`Pull request #${outcome.pullRequestNumber} of ${itemName(project.config, outcome.issueNumber)} merged as ${outcome.mergeSha}`);
    await recordDelegation(session, context, delegation, authorisation, { kind: 'pull-request', number: outcome.pullRequestNumber, issueNumber: outcome.issueNumber });
    return EXIT_CODES.ok;
  });
}
