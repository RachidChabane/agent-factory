import { isDeepStrictEqual } from 'node:util';
import type { InstallationConfigurationSource, InstallationReload } from '@agent-factory/application';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';

export type ConfigurationLoader = () => Promise<AgentFactoryConfig>;
export type ConfigurationListener = (config: AgentFactoryConfig) => void;

/** Settings that take effect at once; everything else waits for a restart. */
const LIVE_INSTALLATION_SECTIONS = ['budget', 'resources'] as const satisfies readonly (keyof AgentFactoryConfig)[];
const LIVE_PROJECT_SECTIONS = ['roles', 'concurrency', 'autonomy'] as const satisfies readonly (keyof ProjectConfig)[];
const PROJECTS_SECTION = 'projects';

function changedInstallationSections(current: AgentFactoryConfig, loaded: AgentFactoryConfig): readonly string[] {
  const keys = Object.keys(current) as (keyof AgentFactoryConfig)[];
  return keys.filter((key) => key !== PROJECTS_SECTION && !LIVE_INSTALLATION_SECTIONS.some((live) => live === key) && !isDeepStrictEqual(current[key], loaded[key]));
}

function changedProjectSections(current: ProjectConfig, loaded: ProjectConfig): readonly string[] {
  const keys = Object.keys(current) as (keyof ProjectConfig)[];
  return keys
    .filter((key) => !LIVE_PROJECT_SECTIONS.some((live) => live === key) && !isDeepStrictEqual(current[key], loaded[key]))
    .map((key) => `${PROJECTS_SECTION}.${current.id}.${key}`);
}

function projectSetChanged(current: AgentFactoryConfig, loaded: AgentFactoryConfig): boolean {
  return !isDeepStrictEqual(
    current.projects.map((project) => project.id),
    loaded.projects.map((project) => project.id),
  );
}

/**
 * The installation's configuration as the running factory applies it: a reload takes the budget,
 * the resources and each project's roles, concurrency and autonomy at once, and names everything else that
 * changed in the file as waiting for a restart.
 */
export class LiveInstallation implements InstallationConfigurationSource {
  private current: AgentFactoryConfig;
  private readonly load: ConfigurationLoader;
  private readonly listeners: ConfigurationListener[] = [];

  constructor(initial: AgentFactoryConfig, load: ConfigurationLoader) {
    this.current = initial;
    this.load = load;
  }

  get config(): AgentFactoryConfig {
    return this.current;
  }

  onChange(listener: ConfigurationListener): void {
    this.listeners.push(listener);
  }

  async reload(): Promise<InstallationReload> {
    const loaded = await this.load();
    const restartRequired = [
      ...changedInstallationSections(this.current, loaded),
      ...(projectSetChanged(this.current, loaded) ? [PROJECTS_SECTION] : []),
      ...this.current.projects.flatMap((project) => {
        const next = loaded.projects.find((candidate) => candidate.id === project.id);
        return next === undefined ? [] : changedProjectSections(project, next);
      }),
    ];
    this.current = {
      ...this.current,
      budget: loaded.budget,
      resources: loaded.resources,
      projects: this.current.projects.map((project) => {
        const next = loaded.projects.find((candidate) => candidate.id === project.id);
        return next === undefined ? project : { ...project, roles: next.roles, concurrency: next.concurrency, autonomy: next.autonomy };
      }),
    };
    for (const listener of this.listeners) listener(this.current);
    return { restartRequired, concurrencyByProject: new Map(this.current.projects.map((project) => [project.id, project.concurrency.issues])) };
  }
}
