import type { FilmOutcome } from '@agent-factory/application';
import { filmBehaviour, FilmsNotConfiguredError } from '../../composition/project/project-use-cases.ts';
import type { ProjectConfig } from '../../config/agent-factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES, type CliOutput } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { runningFactory, withFactoryLock } from './factory-running.ts';
import { itemName, selectedProject, withProjectSession } from './project-session.ts';

export function reportFilm(project: ProjectConfig, outcome: FilmOutcome, output: CliOutput): number {
  const issue = itemName(project, outcome.issueNumber);
  if (outcome.kind === 'failed') {
    output.error(`The film of scenario ${outcome.scenario} for ${issue} failed: ${outcome.reason}`);
    return EXIT_CODES.failure;
  }
  output.line(`Films of scenario ${outcome.scenario} recorded on pull request #${outcome.pullRequestNumber} of ${issue} at ${outcome.commitSha}`);
  output.line(`Before: ${outcome.before.video}`);
  output.line(`After: ${outcome.after.video}`);
  return EXIT_CODES.ok;
}

/**
 * Orders the film of a scenario. A running factory films it in its turn in the installation's queue;
 * without one, the film is recorded now, under the factory's lock.
 */
export async function filmCommand(issueNumber: number, scenario: string, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  return withProjectSession(context, selected, async ({ installation, project }) => {
    if (project.films === null) throw new FilmsNotConfiguredError(project.id);
    const order = { issueNumber, scenario, operator: installation.operator };
    const running = await runningFactory(selected.config);
    if (running !== null) {
      await project.films.queue.order(order);
      context.output.line(`The film of scenario ${scenario} is queued for ${itemName(project.config, issueNumber)}; the factory running as process ${running} records it in its turn`);
      return EXIT_CODES.ok;
    }
    return withFactoryLock(selected.config, async () => {
      const controller = new AbortController();
      const release = abortOnShutdown(controller, context.output);
      try {
        return reportFilm(project.config, await filmBehaviour(project, installation, controller.signal).film(order, controller.signal), context.output);
      } finally {
        release();
      }
    });
  });
}
