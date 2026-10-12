import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Clock, CommandRunner } from '@agent-factory/application';
import type { SourceEnvironment } from '../composition/installation/installation-context.ts';
import { projectOf, type ProjectConfig } from '../config/agent-factory-config.ts';
import { startDemoHealthEndpoints, type DemoHealthEndpoints } from '../demo/demo-health.ts';
import { DEMO_ENVIRONMENTS, DEMO_INSTALLATION, DEMO_PROJECTS, STOREFRONT_ID } from '../demo/demo-projects.ts';
import { prepareDemoWorld } from '../demo/demo-world.ts';
import { storyScenario } from '../demo/story/scenario.ts';
import { STOREFRONT_STORY } from '../demo/story/storefront-story.ts';
import { freePort } from './free-port.ts';

const WORLD_PREFIX = 'agent-factory-e2e-example-';
const HOME_DIRECTORY = 'home';
const ANY_PORT = 0;

export interface ExampleWorldSettings {
  readonly runner: CommandRunner;
  readonly environment: SourceEnvironment;
  readonly clock: Clock;
  readonly userHome: string;
  /** Where the world is made; it lives in a directory of its own below it. */
  readonly temporaryDirectory: string;
}

/** Where a local forge keeps its records and its repository. */
export interface LocalForgeLocation {
  readonly directory: string;
  readonly bareRepositoryPath: string;
}

/**
 * A factory home with the storefront on a local forge and the fake Claude playing the storefront's
 * scripted agents, on a port that was free when the world was made.
 */
export interface ExampleWorld {
  readonly home: string;
  readonly port: number;
  readonly project: ProjectConfig;
  readonly forge: LocalForgeLocation;
  /** Writes a file the operator has at hand, outside the factory's home, and returns its path. */
  writeOperatorFile(name: string, content: string): Promise<string>;
  /** Removes the world, whatever state it is in. */
  close(): Promise<void>;
}

function localForgeOf(project: ProjectConfig): LocalForgeLocation {
  const { forge } = project;
  if (forge.kind !== 'local') throw new Error(`the ${project.id} project is on a ${forge.kind} forge, not a local one`);
  return { directory: forge.directory, bareRepositoryPath: forge.bareRepositoryPath };
}

export async function createExampleWorld(settings: ExampleWorldSettings): Promise<ExampleWorld> {
  const root = await mkdtemp(join(settings.temporaryDirectory, WORLD_PREFIX));
  let health: DemoHealthEndpoints | null = null;
  const close = async (): Promise<void> => {
    await health?.close();
    await rm(root, { recursive: true, force: true });
  };
  try {
    health = await startDemoHealthEndpoints(DEMO_ENVIRONMENTS, ANY_PORT);
    const port = await freePort();
    const home = join(root, HOME_DIRECTORY);
    const world = await prepareDemoWorld({
      home,
      port,
      runner: settings.runner,
      environment: settings.environment,
      clock: settings.clock,
      userHome: settings.userHome,
      health,
      projects: DEMO_PROJECTS.filter((project) => project.id === STOREFRONT_ID),
      scenario: storyScenario([STOREFRONT_STORY]),
      installation: DEMO_INSTALLATION,
    });
    const project = projectOf(world.config, STOREFRONT_ID);
    return {
      home,
      port,
      project,
      forge: localForgeOf(project),
      writeOperatorFile: async (name, content) => {
        const path = join(root, name);
        await writeFile(path, content);
        return path;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
