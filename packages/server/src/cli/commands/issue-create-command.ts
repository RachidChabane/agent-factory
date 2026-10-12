import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createIssueFromPlan, planIssueCreation, specOriginOf, validateSpec } from '@agent-factory/application';
import { projectConventions } from '../../composition/project/project-settings.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { forgeName } from './forge-names.ts';
import { itemName, selectedProject, withProjectEvents, withProjectSession } from './project-session.ts';

const UTF8 = 'utf8';
const LABEL_SEPARATOR = ', ';

function issueList(numbers: readonly number[]): string {
  return numbers.map((number) => `#${number}`).join(LABEL_SEPARATOR);
}

export interface IssueCreateOptions {
  /** The issues the new one waits on, which must exist; the factory takes the issue once they are done. */
  readonly blockedBy: readonly number[];
  /** The operator saw what is created on GitHub and confirms it. */
  readonly confirmed: boolean;
  /** The operator's explicit order to validate the spec at once, so the factory takes the issue. */
  readonly start: boolean;
}

export async function issueCreateCommand(specPath: string, options: IssueCreateOptions, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const { project } = selected;
  const path = resolve(context.workingDirectory, specPath);
  const text = await readFile(path, UTF8);
  const origin = await withProjectEvents(context, selected, (events) => specOriginOf(events, project.directories.requests, path));
  const plan = planIssueCreation(text, origin, projectConventions(project), options.blockedBy);
  if (project.forge.kind === 'github' && !options.confirmed) {
    context.output.line(`This creates an issue on ${forgeName(project)}:`);
    context.output.line(`Title: ${plan.title}`);
    context.output.line(`Labels: ${plan.labels.join(LABEL_SEPARATOR)}`);
    if (plan.blockedBy.length > 0) context.output.line(`Blocked by: ${issueList(plan.blockedBy)}`);
    context.output.line('');
    context.output.line(plan.body.trimEnd());
    context.output.line('');
    context.output.error('Nothing was created. Re-run with --confirm to create it.');
    return EXIT_CODES.confirmationRequired;
  }
  return withProjectSession(context, selected, async (session) => {
    const { dependencies, conventions } = session.project;
    const issue = await createIssueFromPlan(dependencies, plan);
    const from = plan.origin === null ? '' : ` from ${plan.origin.requestId} ${plan.origin.specId}`;
    const waits = plan.blockedBy.length === 0 ? '' : `, blocked by ${issueList(plan.blockedBy)}`;
    const created = `${itemName(project, issue.number)} created on ${forgeName(project)}${from} [${issue.labels.join(LABEL_SEPARATOR)}${waits}]`;
    if (!options.start) {
      context.output.line(`${created}; validate it (${conventions.labels.validated}) once you have reviewed it`);
      return EXIT_CODES.ok;
    }
    await validateSpec(dependencies, issue.number, session.installation.operator, conventions);
    context.output.line(`${created} and validated: the factory takes it at its next tick`);
    return EXIT_CODES.ok;
  });
}
