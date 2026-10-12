import { assertPipelineCapacity, type RunIssueOutcome } from '@agent-factory/application';
import { issuePipeline } from '../../composition/project/project-use-cases.ts';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES, type CliOutput } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { withFactoryLock } from './factory-running.ts';
import { itemName, selectedProject, withProjectSession } from './project-session.ts';

export function reportOutcome(project: ProjectConfig, outcome: RunIssueOutcome, output: CliOutput): number {
  const issue = itemName(project, outcome.issueNumber);
  switch (outcome.kind) {
    case 'pr-open':
      output.line(`${issue}: pull request #${outcome.pullRequest.number} is open: ${outcome.pullRequest.url}`);
      return EXIT_CODES.ok;
    case 'needs-human':
      output.error(`${issue} needs a human: ${outcome.reason}`);
      return EXIT_CODES.needsHuman;
    case 'blocked':
      output.error(`${issue} waits on ${outcome.blockers.map((number) => `#${number}`).join(', ')}`);
      return EXIT_CODES.blocked;
    case 'beyond-pipeline':
      output.line(`${issue} is ${outcome.state}; nothing left to run`);
      return EXIT_CODES.ok;
  }
}

export async function runIssueCommand(issueNumber: number, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  return withFactoryLock(selected.config, () =>
    withProjectSession(context, selected, async ({ project }) => {
      const controller = new AbortController();
      const release = abortOnShutdown(controller, context.output);
      try {
        await assertPipelineCapacity(project.dependencies.events, issueNumber, project.config.concurrency.issues);
        return reportOutcome(project.config, await issuePipeline(project, controller.signal).runIssue(issueNumber), context.output);
      } finally {
        release();
      }
    }),
  );
}
