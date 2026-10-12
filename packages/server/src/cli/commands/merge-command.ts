import { MergeOnOrder } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { itemName, selectedProject, withProjectSession } from './project-session.ts';

export async function mergeCommand(pullRequestNumber: number, expectedHeadSha: string, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  return withProjectSession(context, selected, async ({ project }) => {
    const outcome = await new MergeOnOrder(project.dependencies).merge({ pullRequestNumber, expectedHeadSha });
    context.output.line(`Pull request #${outcome.pullRequestNumber} of ${itemName(project.config, outcome.issueNumber)} merged as ${outcome.mergeSha}`);
    return EXIT_CODES.ok;
  });
}
