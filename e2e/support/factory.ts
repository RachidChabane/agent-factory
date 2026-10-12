import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FactoryApi } from './api.ts';
import { demoIsSettled } from './demo-state.ts';
import { ManagedProcess } from './managed-process.ts';
import { FACTORY_CLI, FACTORY_LOG_DIRECTORY, REPOSITORY_ROOT } from './paths.ts';
import { freePortPair, isListening } from './ports.ts';
import { HOLD_FILE_NAME } from './rehearsal-layout.ts';

export const FACTORY_MODES = ['demo', 'rehearsal'] as const;
export type FactoryMode = (typeof FACTORY_MODES)[number];

const LOOPBACK = '127.0.0.1';
const START_TIMEOUT_MS = 90_000;
const STORY_TIMEOUT_MS = 300_000;
const SETTLE_TIMEOUT_MS = 240_000;
const WORLD_TIMEOUT_MS = 180_000;
/** The operator of a rehearsal is whoever the factory's `USER` names. */
const REHEARSAL_OPERATOR = 'Alex Morgan';
const WORLD_HELPER = join(REPOSITORY_ROOT, 'e2e', 'support', 'rehearsal-world.ts');
const READY_LINE = /^READY (.+)$/m;
const STOPPING_LINE = /^Factory stopped$/m;

export interface RunningFactory {
  readonly mode: FactoryMode;
  readonly origin: string;
  readonly port: number;
  readonly api: FactoryApi;
  /** The rehearsal's home directory; null for the demonstration, which keeps its own out of reach. */
  readonly home: string | null;
  /** Everything the factory printed so far. */
  output(): string;
  /** Makes agent runs wait before they start, until the returned function is called; a rehearsal only. */
  holdAgents(): Promise<() => Promise<void>>;
  stop(): Promise<void>;
}

interface RehearsalWorld {
  readonly home: string;
}

function factoryEnvironment(extra: Readonly<Record<string, string>> = {}): Record<string, string | undefined> {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('AGENT_FACTORY_')));
  return { ...inherited, ...extra };
}

function factoryCommand(...args: readonly string[]): string[] {
  return [process.execPath, FACTORY_CLI, ...args];
}

async function assertReleased(port: number): Promise<void> {
  for (const candidate of [port, port + 1]) {
    if (await isListening(candidate)) throw new Error(`port ${candidate} still accepts connections after the factory stopped`);
  }
}

async function startDemonstration(): Promise<RunningFactory> {
  const port = await freePortPair();
  const factory = new ManagedProcess({
    command: factoryCommand('start', '--demo', '--port', String(port)),
    cwd: REPOSITORY_ROOT,
    env: factoryEnvironment(),
    logFile: join(FACTORY_LOG_DIRECTORY, `demo-${port}.log`),
    stoppingLine: STOPPING_LINE,
  });
  const api = new FactoryApi(`http://${LOOPBACK}:${port}`);
  try {
    await factory.waitForOutput(/Factory started on/, 'the demonstration to start', START_TIMEOUT_MS);
    await factory.waitForOutput(/Every scripted change has reached the factory/, 'the story to play', STORY_TIMEOUT_MS);
    await api.until('the audits, the release and the pull requests of the story are in', demoIsSettled, { timeoutMs: SETTLE_TIMEOUT_MS });
  } catch (error) {
    await factory.stop();
    throw error;
  }
  return {
    mode: 'demo',
    origin: api.originUrl,
    port,
    api,
    home: null,
    output: () => factory.output,
    holdAgents: () => Promise.reject(new Error('agent runs are held in a rehearsal only')),
    stop: async () => {
      const exit = await factory.stop();
      if (exit.code !== 0) throw new Error(`the demonstration stopped with ${exit.signal ?? `exit code ${exit.code}`}:\n${factory.tail()}`);
      await assertReleased(port);
    },
  };
}

async function startRehearsal(): Promise<RunningFactory> {
  const port = await freePortPair();
  const world = new ManagedProcess({
    command: [process.execPath, WORLD_HELPER, '--port', String(port)],
    cwd: REPOSITORY_ROOT,
    env: factoryEnvironment(),
    logFile: join(FACTORY_LOG_DIRECTORY, `rehearsal-world-${port}.log`),
  });
  let factory: ManagedProcess | null = null;
  try {
    const ready = await world.waitForOutput(READY_LINE, 'the rehearsal world to be prepared', WORLD_TIMEOUT_MS);
    const { home } = JSON.parse(ready[1] ?? '') as RehearsalWorld;
    factory = new ManagedProcess({
      command: factoryCommand('start', '--port', String(port)),
      cwd: REPOSITORY_ROOT,
      env: factoryEnvironment({ AGENT_FACTORY_HOME: home, USER: REHEARSAL_OPERATOR }),
      logFile: join(FACTORY_LOG_DIRECTORY, `rehearsal-${port}.log`),
      stoppingLine: STOPPING_LINE,
    });
    await factory.waitForOutput(/Factory started on/, 'the rehearsal to start', START_TIMEOUT_MS);
    const started = factory;
    const api = new FactoryApi(`http://${LOOPBACK}:${port}`);
    return {
      mode: 'rehearsal',
      origin: api.originUrl,
      port,
      api,
      home,
      output: () => started.output,
      holdAgents: async () => {
        const holdFile = join(home, HOLD_FILE_NAME);
        await writeFile(holdFile, '');
        return () => rm(holdFile, { force: true });
      },
      stop: async () => {
        const exit = await started.stop();
        await world.stop();
        if (exit.code !== 0) throw new Error(`the rehearsal stopped with ${exit.signal ?? `exit code ${exit.code}`}:\n${started.tail()}`);
        await assertReleased(port);
      },
    };
  } catch (error) {
    await factory?.stop();
    await world.stop();
    throw error;
  }
}

export function startFactory(mode: FactoryMode): Promise<RunningFactory> {
  return mode === 'demo' ? startDemonstration() : startRehearsal();
}
