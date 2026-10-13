import { checkTool, FilmToolWaitReporter, type FilmLaneTools, type FilmTool, type FilmToolChecks } from '@agent-factory/application';
import type { InstallationRuntime } from '../installation/installation-runtime.ts';
import type { ProjectRuntime } from './project-runtime.ts';

/**
 * The tools the films of a project need before they start, with what checks them: a tool the installation declares is
 * checked and its reading recorded with the installation's, a tool of the project with the project's own. Null when the
 * films of the project need none.
 */
export function filmLaneTools(runtime: InstallationRuntime, project: ProjectRuntime): FilmLaneTools | null {
  const names = project.config.evidence.films?.tools ?? [];
  if (names.length === 0) return null;
  const own = new Map(project.config.tools.map((tool) => [tool.name, tool]));
  const shared = new Map(runtime.config.tools.map((tool) => [tool.name, tool]));
  const required = names.flatMap((name): FilmTool[] => {
    const ownTool = own.get(name);
    const declared = ownTool ?? shared.get(name);
    return declared === undefined ? [] : [{ name, scope: ownTool === undefined ? 'installation' : 'project', loginCommand: declared.login?.command ?? null }];
  });
  const checks: FilmToolChecks = {
    check: (tool) =>
      tool.scope === 'project'
        ? checkTool(project.dependencies.events, runtime.projectTools(project.id), tool.name, runtime.operator)
        : checkTool(runtime.events, runtime.tools, tool.name, runtime.operator),
  };
  return { required, checks, wait: new FilmToolWaitReporter({ projectId: project.id, events: project.dependencies.events, notifications: project.notifications }) };
}
