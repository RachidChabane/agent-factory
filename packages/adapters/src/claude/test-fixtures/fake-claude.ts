import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { argv, env, exit, stdin, stdout, stderr } from 'node:process';
import {
  FAKE_FAILURE_EXIT_CODE,
  FAKE_FAILURE_MESSAGE,
  FAKE_FIXTURE_FLAG,
  FAKE_FLOOD_LINE_COUNT,
  FAKE_GRANDCHILD_TYPE,
  FAKE_INVOCATION_TYPE,
  FAKE_MODE_FLAG,
  FAKE_MODES,
  FAKE_OVERSIZED_LINE_CHARACTERS,
  FAKE_SESSION_ID,
  FAKE_SUCCESS_RESULT,
  type FakeMode,
} from './fake-claude-protocol.ts';

const SETTINGS_FLAG = '--settings';
const INTERRUPTED_EXIT_CODE = 130;
const KEEP_ALIVE_MS = 1_000;
const GRANDCHILD_SLEEP_SECONDS = '120';
const INIT_LINE = { type: 'system', subtype: 'init', session_id: FAKE_SESSION_ID, model: 'fake-model' };

function valueAfter(flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function emit(value: unknown): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

async function readPrompt(): Promise<string> {
  let prompt = '';
  for await (const chunk of stdin) {
    prompt += String(chunk);
  }
  return prompt;
}

function keepAlive(): void {
  setInterval(() => undefined, KEEP_ALIVE_MS);
}

const behaviours: Readonly<Record<FakeMode, () => Promise<void>>> = {
  replay: async () => {
    const fixture = valueAfter(FAKE_FIXTURE_FLAG);
    if (fixture === undefined) {
      throw new Error(`${FAKE_FIXTURE_FLAG} is required in replay mode`);
    }
    stdout.write(readFileSync(fixture, 'utf8'));
  },
  echo: async () => {
    emit(INIT_LINE);
    emit({ type: FAKE_INVOCATION_TYPE, argv: argv.slice(2), prompt: await readPrompt(), env, cwd: process.cwd() });
    emit(FAKE_SUCCESS_RESULT);
  },
  fail: async () => {
    stderr.write(`${FAKE_FAILURE_MESSAGE}\n`);
    exit(FAKE_FAILURE_EXIT_CODE);
  },
  hang: async () => {
    emit(INIT_LINE);
    process.once('SIGINT', () => exit(INTERRUPTED_EXIT_CODE));
    keepAlive();
  },
  stubborn: async () => {
    process.on('SIGINT', () => undefined);
    process.on('SIGTERM', () => undefined);
    const grandchild = spawn('sleep', [GRANDCHILD_SLEEP_SECONDS], { stdio: 'ignore' });
    emit({ type: FAKE_GRANDCHILD_TYPE, pid: grandchild.pid });
    keepAlive();
  },
  flood: async () => {
    emit(INIT_LINE);
    for (let index = 0; index < FAKE_FLOOD_LINE_COUNT; index += 1) {
      emit({ type: 'system', subtype: 'notification', session_id: FAKE_SESSION_ID, index });
    }
    emit({ type: 'assistant', session_id: FAKE_SESSION_ID, padding: 'x'.repeat(FAKE_OVERSIZED_LINE_CHARACTERS) });
    emit(FAKE_SUCCESS_RESULT);
  },
  tamper: async () => {
    const settingsPath = valueAfter(SETTINGS_FLAG);
    if (settingsPath !== undefined) {
      appendFileSync(settingsPath, '\n');
    }
    emit(INIT_LINE);
    emit(FAKE_SUCCESS_RESULT);
  },
};

function isFakeMode(value: string | undefined): value is FakeMode {
  return FAKE_MODES.some((mode) => mode === value);
}

const mode = valueAfter(FAKE_MODE_FLAG);
if (!isFakeMode(mode)) {
  throw new Error(`unknown fake mode ${String(mode)}`);
}
await behaviours[mode]();
