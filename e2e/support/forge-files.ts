import { join } from 'node:path';
import { LocalGitHubFiles } from '../../packages/adapters/src/github-local/localGitHubFiles.ts';
import { PROJECTS_DIRECTORY } from '../../packages/server/src/config/agent-factory-config.ts';
import type { RunningFactory } from './factory.ts';

/** The directory the demonstration world gives the local forge of each project, under the project's own directory. */
const FORGE_DIRECTORY_NAME = 'forge';

/** The files a project's local forge keeps (issues, pull requests, deployments, workflow dispatches), read as the forge reads them. */
export function localForgeOf(factory: RunningFactory, project: string): LocalGitHubFiles {
  if (factory.home === null) throw new Error('the factory keeps its home out of reach, so its forge cannot be read');
  return new LocalGitHubFiles(join(factory.home, PROJECTS_DIRECTORY, project, FORGE_DIRECTORY_NAME));
}
