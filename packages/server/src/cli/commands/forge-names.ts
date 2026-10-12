import type { ProjectConfig } from '../../config/agent-factory-config.ts';

/** Where the project's issues and pull requests live, as the operator knows it. */
export function forgeName(project: ProjectConfig): string {
  const slug = `${project.repository.owner}/${project.repository.name}`;
  return project.forge.kind === 'local' ? `the local forge of ${slug} (${project.forge.directory})` : `GitHub ${slug}`;
}
