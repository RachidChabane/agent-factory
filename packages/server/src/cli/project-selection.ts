import { projectOf, type AgentFactoryConfig, type ProjectConfig } from '../config/agent-factory-config.ts';
import { PROJECT_OPTION } from './command-line.ts';

export class ProjectRequiredError extends Error {
  constructor(known: readonly string[]) {
    super(`this command acts on one project; name it with ${PROJECT_OPTION} <id>, one of: ${known.join(', ')}`);
    this.name = 'ProjectRequiredError';
  }
}

/** The project a command acts on: the one named, or the only one of the configuration. */
export function selectProject(config: AgentFactoryConfig, requested: string | null): ProjectConfig {
  if (requested !== null) return projectOf(config, requested);
  const [only, ...others] = config.projects;
  if (only === undefined || others.length > 0) throw new ProjectRequiredError(config.projects.map((project) => project.id));
  return only;
}
