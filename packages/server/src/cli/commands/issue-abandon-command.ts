import { AbandonIssue } from '@agent-factory/application';
import type { FactoryConfig } from '../../config/factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { withFactoryLock } from './factory-running.ts';

const OPERATOR_VARIABLE = 'USER';
const UNNAMED_OPERATOR = 'operator';
const LOCAL_MODE = 'local';

function trackerOf(config: FactoryConfig): string {
  return config.github.mode === LOCAL_MODE ? `the local GitHub ${config.github.local.directory}` : `${config.target.owner}/${config.target.name}`;
}

export async function issueAbandonCommand(issueNumber: number, reason: string, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const operator = context.environment[OPERATOR_VARIABLE] ?? UNNAMED_OPERATOR;
  return withFactoryLock(config, async () => {
    const factory = await context.openFactory(config);
    try {
      const outcome = await new AbandonIssue(factory.dependencies).abandon({ issueNumber, operator, reason });
      const worktree = outcome.releasedWorktree === null ? 'it held no worktree' : `its worktree ${outcome.releasedWorktree} is free`;
      context.output.line(`Issue #${issueNumber} abandoned: ${worktree}; the factory will not start it again.`);
      const left = [
        `the issue stays open on ${trackerOf(config)}`,
        ...(outcome.branch === null ? [] : [`branch ${outcome.branch} stays in ${config.target.clonePath}`]),
        ...(outcome.openPullRequest === null ? [] : [`pull request #${outcome.openPullRequest} stays open`]),
      ];
      context.output.line(`Left as it is: ${left.join('; ')}.`);
      return EXIT_CODES.ok;
    } finally {
      factory.close();
    }
  });
}
