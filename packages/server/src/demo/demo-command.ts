import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliContext } from '../cli/cli-context.ts';
import { serveInstallation } from '../cli/commands/start-command.ts';
import { startDemoHealthEndpoints } from './demo-health.ts';
import { DEMO_ENVIRONMENTS, DEMO_INSTALLATION, DEMO_PROJECTS } from './demo-projects.ts';
import { DEMO_SERVER_PORT, prepareDemoWorld } from './demo-world.ts';

const DEMO_HOME_PREFIX = 'agent-factory-demo-';
const HEALTH_PORT_OFFSET = 1;

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
      scenario: {},
      installation: DEMO_INSTALLATION,
    });
    return await serveInstallation(world.config, { mode: 'demo' }, context);
  } finally {
    await health.close();
    await rm(home, { recursive: true, force: true });
  }
}
