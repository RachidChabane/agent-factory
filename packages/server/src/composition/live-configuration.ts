import { isDeepStrictEqual } from 'node:util';
import type { ConfigurationSource, ReloadedConfiguration } from '@agent-factory/application';
import type { FactoryConfig } from '../config/factory-config.ts';

export const LIVE_CONFIG_SECTIONS = ['roles', 'concurrency', 'resources', 'budget'] as const;
export const RESTART_CONFIG_SECTIONS = [
  'target',
  'worktreePool',
  'gate',
  'conventionalCommits',
  'sandbox',
  'secretScan',
  'github',
  'claude',
  'daemon',
  'notifications',
  'server',
  'release',
  'delivery',
  'directories',
] as const satisfies readonly (keyof FactoryConfig)[];

export type ConfigurationLoader = () => Promise<FactoryConfig>;
export type ConfigurationListener = (config: FactoryConfig) => void;

export class LiveConfiguration implements ConfigurationSource {
  private current: FactoryConfig;
  private readonly load: ConfigurationLoader;
  private readonly listeners: ConfigurationListener[] = [];

  constructor(initial: FactoryConfig, load: ConfigurationLoader) {
    this.current = initial;
    this.load = load;
  }

  get config(): FactoryConfig {
    return this.current;
  }

  onChange(listener: ConfigurationListener): void {
    this.listeners.push(listener);
  }

  async reload(): Promise<ReloadedConfiguration> {
    const loaded = await this.load();
    const restartRequired = RESTART_CONFIG_SECTIONS.filter((section) => !isDeepStrictEqual(loaded[section], this.current[section]));
    this.current = {
      ...this.current,
      roles: loaded.roles,
      concurrency: loaded.concurrency,
      resources: loaded.resources,
      budget: loaded.budget,
    };
    for (const listener of this.listeners) listener(this.current);
    return { concurrency: this.current.concurrency.issues, restartRequired };
  }
}
