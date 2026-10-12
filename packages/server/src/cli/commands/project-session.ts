import { ProjectEventStore, type EventStore } from '@agent-factory/application';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import type { InstallationRuntime } from '../../composition/installation/installation-runtime.ts';
import type { ProjectRuntime } from '../../composition/project/project-runtime.ts';
import type { CliContext } from '../cli-context.ts';
import { PROGRAM_NAME, PROJECT_OPTION } from '../command-line.ts';
import { selectProject } from '../project-selection.ts';

export interface ProjectSession {
  readonly installation: InstallationRuntime;
  readonly project: ProjectRuntime;
}

export interface SelectedProject {
  readonly config: AgentFactoryConfig;
  readonly project: ProjectConfig;
}

export async function selectedProject(context: CliContext, requested: string | null): Promise<SelectedProject> {
  const config = await context.loadConfig();
  return { config, project: selectProject(config, requested) };
}

/** Opens the installation with only the project the command acts on, and closes it once the work is done. */
export async function withProjectSession<T>(context: CliContext, selected: SelectedProject, work: (session: ProjectSession) => Promise<T>): Promise<T> {
  const installation = await context.openInstallation(selected.config, { projects: [selected.project.id] });
  try {
    return await work({ installation, project: installation.project(selected.project.id) });
  } finally {
    installation.close();
  }
}

/** Reads and writes the project's events without opening its forge or worktrees. */
export async function withProjectEvents<T>(context: CliContext, selected: SelectedProject, work: (events: EventStore) => Promise<T>): Promise<T> {
  const eventLog = context.openEventLog(selected.config);
  try {
    return await work(new ProjectEventStore(eventLog.events, selected.project.id));
  } finally {
    eventLog.close();
  }
}

/** The command line that does something next on the project, naming the project when the installation has several. */
export function nextCommand(selected: SelectedProject, ...words: readonly string[]): string {
  const project = selected.config.projects.length > 1 ? [PROJECT_OPTION, selected.project.id] : [];
  return [PROGRAM_NAME, ...project, ...words].join(' ');
}

/** How an issue or pull request of the project is named in messages: `storefront#12`. */
export function itemName(project: ProjectConfig, number: number): string {
  return `${project.id}#${number}`;
}
