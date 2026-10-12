import { AbandonIssue } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { withFactoryLock } from './factory-running.ts';
import { forgeName } from './forge-names.ts';
import { itemName, selectedProject, withProjectSession } from './project-session.ts';

const OPERATOR_VARIABLE = 'USER';
const UNNAMED_OPERATOR = 'operator';

export async function issueAbandonCommand(issueNumber: number, reason: string, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const operator = context.environment[OPERATOR_VARIABLE] ?? UNNAMED_OPERATOR;
  return withFactoryLock(selected.config, () =>
    withProjectSession(context, selected, async ({ project }) => {
      const outcome = await new AbandonIssue(project.dependencies).abandon({ issueNumber, operator, reason });
      const worktree = outcome.releasedWorktree === null ? 'it held no worktree' : `its worktree ${outcome.releasedWorktree} is free`;
      context.output.line(`${itemName(project.config, issueNumber)} abandoned: ${worktree}; the factory will not start it again.`);
      const left = [
        `the issue stays open on ${forgeName(project.config)}`,
        ...(outcome.branch === null ? [] : [`branch ${outcome.branch} stays in ${project.config.clonePath}`]),
        ...(outcome.openPullRequest === null ? [] : [`pull request #${outcome.openPullRequest} stays open`]),
      ];
      context.output.line(`Left as it is: ${left.join('; ')}.`);
      return EXIT_CODES.ok;
    }),
  );
}
