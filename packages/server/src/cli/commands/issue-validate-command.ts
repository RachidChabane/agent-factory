import { validateSpec, type Delegation } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { authorisedDelegate, recordDelegation } from './delegated-gestures.ts';
import { itemName, selectedProject, withProjectSession } from './project-session.ts';

/** Validates the spec of a drafted issue so the factory takes it: the operator's gesture, or the delegate's when `--as` names it. */
export async function issueValidateCommand(issueNumber: number, delegation: Delegation | null, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const authorisation = authorisedDelegate(selected.project, delegation, 'validate-spec');
  return withProjectSession(context, selected, async (session) => {
    const { dependencies, conventions } = session.project;
    await validateSpec(dependencies, issueNumber, session.installation.operator, conventions, delegation);
    context.output.line(`The spec of ${itemName(selected.project, issueNumber)} is validated and labelled ${conventions.labels.validated}: the factory takes it at its next tick`);
    await recordDelegation(session, context, delegation, authorisation, { kind: 'issue', number: issueNumber, issueNumber });
    return EXIT_CODES.ok;
  });
}
