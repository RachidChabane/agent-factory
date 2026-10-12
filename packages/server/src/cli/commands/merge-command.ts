import { MergeOnOrder } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';

export async function mergeCommand(pullRequestNumber: number, expectedHeadSha: string, context: CliContext): Promise<number> {
  const factory = await context.openFactory(await context.loadConfig());
  try {
    const outcome = await new MergeOnOrder(factory.dependencies).merge({ pullRequestNumber, expectedHeadSha });
    context.output.line(`Pull request #${outcome.pullRequestNumber} of issue #${outcome.issueNumber} merged as ${outcome.mergeSha}`);
    return EXIT_CODES.ok;
  } finally {
    factory.close();
  }
}
