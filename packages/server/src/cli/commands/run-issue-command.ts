import { assertPipelineCapacity } from '@agent-factory/application';
import { issuePipeline } from '../../composition/use-cases.ts';
import type { RunIssueOutcome } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES, type CliOutput } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { withFactoryLock } from './factory-running.ts';


export function reportOutcome(outcome: RunIssueOutcome, output: CliOutput): number {
  switch (outcome.kind) {
    case 'pr-open':
      output.line(`Issue #${outcome.issueNumber}: pull request #${outcome.pullRequest.number} is open: ${outcome.pullRequest.url}`);
      return EXIT_CODES.ok;
    case 'needs-human':
      output.error(`Issue #${outcome.issueNumber} needs a human: ${outcome.reason}`);
      return EXIT_CODES.needsHuman;
    case 'blocked':
      output.error(`Issue #${outcome.issueNumber} waits on ${outcome.blockers.map((number) => `#${number}`).join(', ')}`);
      return EXIT_CODES.blocked;
    case 'beyond-pipeline':
      output.line(`Issue #${outcome.issueNumber} is ${outcome.state}; nothing left to run`);
      return EXIT_CODES.ok;
  }
}

export async function runIssueCommand(issueNumber: number, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  return withFactoryLock(config, async () => {
    const factory = await context.openFactory(config);
    const controller = new AbortController();
    const release = abortOnShutdown(controller, context.output);
    try {
      await assertPipelineCapacity(factory.dependencies.events, issueNumber, config.concurrency.issues);
      const pipeline = issuePipeline(factory, controller.signal);
      return reportOutcome(await pipeline.runIssue(issueNumber), context.output);
    } finally {
      release();
      factory.close();
    }
  });
}
