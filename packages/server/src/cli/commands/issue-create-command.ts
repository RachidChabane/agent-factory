import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createIssueFromPlan, planIssueCreation, specOriginOf } from '@agent-factory/application';
import { projectConventions } from '../../composition/project/project-settings.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { forgeName } from './forge-names.ts';
import { itemName, selectedProject, withProjectEvents, withProjectSession } from './project-session.ts';

const UTF8 = 'utf8';
const LABEL_SEPARATOR = ', ';

export async function issueCreateCommand(specPath: string, confirmed: boolean, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const { project } = selected;
  const path = resolve(context.workingDirectory, specPath);
  const text = await readFile(path, UTF8);
  const origin = await withProjectEvents(context, selected, (events) => specOriginOf(events, project.directories.requests, path));
  const plan = planIssueCreation(text, origin, projectConventions(project));
  if (project.forge.kind === 'github' && !confirmed) {
    context.output.line(`This creates an issue on ${forgeName(project)}:`);
    context.output.line(`Title: ${plan.title}`);
    context.output.line(`Labels: ${plan.labels.join(LABEL_SEPARATOR)}`);
    context.output.line('');
    context.output.line(plan.body.trimEnd());
    context.output.line('');
    context.output.error('Nothing was created. Re-run with --confirm to create it.');
    return EXIT_CODES.confirmationRequired;
  }
  return withProjectSession(context, selected, async (session) => {
    const issue = await createIssueFromPlan(session.project.dependencies, plan);
    const from = plan.origin === null ? '' : ` from ${plan.origin.requestId} ${plan.origin.specId}`;
    const validated = project.conventions.labels.validated;
    context.output.line(`${itemName(project, issue.number)} created on ${forgeName(project)}${from} [${issue.labels.join(LABEL_SEPARATOR)}]; add ${validated} once you have reviewed it`);
    return EXIT_CODES.ok;
  });
}
