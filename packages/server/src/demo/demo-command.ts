import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliContext } from '../cli/cli-context.ts';
import { serveInstallation, type CompanionTask } from '../cli/commands/start-command.ts';
import { SystemSleeper } from '../composition/system.ts';
import { startDemoHealthEndpoints } from './demo-health.ts';
import { DEMO_ENVIRONMENTS, DEMO_INSTALLATION, DEMO_OPERATOR, DEMO_PROJECTS } from './demo-projects.ts';
import { DEMO_SERVER_PORT, prepareDemoWorld } from './demo-world.ts';
import { LEDGER_STORY } from './story/ledger-story.ts';
import { storyScenario } from './story/scenario.ts';
import { StoryPlayer } from './story/story-player.ts';
import { STOREFRONT_STORY } from './story/storefront-story.ts';

const DEMO_HOME_PREFIX = 'agent-factory-demo-';
const HEALTH_PORT_OFFSET = 1;
const STORIES = [STOREFRONT_STORY, LEDGER_STORY] as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Plays every project's story while the factory runs; a story that stops early is reported and the others go on. */
function playStories(context: CliContext, home: string): CompanionTask {
  return async (runtime, _running, signal) => {
    const settings = { runner: context.runner, sleeper: new SystemSleeper(), log: runtime.log, workDirectory: home };
    const outcomes = await Promise.allSettled(STORIES.map((story) => new StoryPlayer(runtime, runtime.project(story.project), story, settings).play(signal)));
    if (signal.aborted) return;
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'rejected') context.output.error(`The ${STORIES[index]?.project ?? 'project'} activity stopped: ${message(outcome.reason)}`);
    });
    context.output.line('Every scripted change has reached the factory; the cockpit now shows them, and every button acts on the running factory.');
  };
}

/** Runs the factory on fictional projects, with scripted agents and local forges: no account, no credential, no network. */
export async function startDemoCommand(context: CliContext, port: number | null): Promise<number> {
  const serverPort = port ?? DEMO_SERVER_PORT;
  const home = await mkdtemp(join(tmpdir(), DEMO_HOME_PREFIX));
  context.output.line(`Demonstration home: ${home}; it is removed when the demonstration stops`);
  const health = await startDemoHealthEndpoints(DEMO_ENVIRONMENTS, serverPort + HEALTH_PORT_OFFSET);
  try {
    const world = await prepareDemoWorld({
      home,
      port: serverPort,
      runner: context.runner,
      environment: context.environment,
      clock: context.clock,
      userHome: context.userHome,
      health,
      projects: DEMO_PROJECTS,
      scenario: storyScenario(STORIES),
      installation: DEMO_INSTALLATION,
    });
    return await serveInstallation(world.config, { mode: 'demo', operator: DEMO_OPERATOR }, context, playStories(context, home));
  } finally {
    await health.close();
    await rm(home, { recursive: true, force: true });
  }
}
