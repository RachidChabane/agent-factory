import type { PipelineSettings } from '@agent-factory/application';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf, type AgentFactoryConfig } from '../../../config/agent-factory-config.ts';
import { pipelineSettings } from '../../../composition/project/project-settings.ts';
import type { DemoHealthEndpoints } from '../../demo-health.ts';
import { DEMO_INSTALLATION, DEMO_PROJECTS } from '../../demo-projects.ts';

const HOME = '/home/operator/.agent-factory';
const USER_HOME = '/home/operator';
const CONFIG_PATH = `${HOME}/config.yaml`;
const SERVER_PORT = 7431;
const HEALTH_BASE_URL = 'http://127.0.0.1:7432';
const FORGE_DIRECTORY = 'forge';
const CLONE_DIRECTORY = 'clone';
const NO_ENVIRONMENT: Readonly<Record<string, string | undefined>> = {};

const HEALTH: DemoHealthEndpoints = {
  url: (path) => `${HEALTH_BASE_URL}${path}`,
  close: () => Promise.resolve(),
};

function configurationText(): string {
  return stringify({
    version: 1,
    server: { port: SERVER_PORT },
    claude: { command: ['node', 'claude.ts'], accounts: [{ name: 'primary', configDir: 'claude-primary', billing: 'subscription' }] },
    ...DEMO_INSTALLATION,
    projects: DEMO_PROJECTS.map((project) => ({
      id: project.id,
      name: project.name,
      forge: { kind: 'local', repository: project.repository, directory: FORGE_DIRECTORY },
      clone: CLONE_DIRECTORY,
      ...project.settings(HEALTH),
    })),
  });
}

/** The installation the demonstration's projects resolve to, read through the same parser as a real configuration file. */
export function resolvedConfiguration(): AgentFactoryConfig {
  return parseAgentFactoryConfig(configurationText(), HOME, CONFIG_PATH, USER_HOME);
}

/** The gate, the issue types and the conventions the factory uses for one project of the installation. */
export function pipelineSettingsOf(configuration: AgentFactoryConfig, projectId: string): PipelineSettings {
  return pipelineSettings(configuration, projectOf(configuration, projectId), NO_ENVIRONMENT);
}
