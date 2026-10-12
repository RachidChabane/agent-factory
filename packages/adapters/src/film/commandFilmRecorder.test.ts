import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilmRecordingError, type FilmRequest, type FilmSettings } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandSpawnError } from '../process/errors.ts';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { CommandFilmRecorder } from './commandFilmRecorder.ts';

const TOOL_FILE = 'film-tool.mjs';
const REPLAY_FILE = 'replay.json';
const SHORT_TIMEOUT_MS = 800;
const GENEROUS_TIMEOUT_MS = 30_000;

/** A stand-in for a project's film tool: it writes what its scenario name tells it to write. */
const FILM_TOOL = `
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, token, index, all) => (token.startsWith('--') ? [...pairs, [token.slice(2), all[index + 1] ?? '']] : pairs), []));
const out = options.out;
await mkdir(out, { recursive: true });
await writeFile(join(out, 'invocation.txt'), JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), token: process.env.OPERATOR_SESSION ?? null, key: process.env.FILM_API_KEY ?? null, override: process.env.OVERRIDDEN ?? null }));
const scenario = options.scenario;
const report = (body) => writeFile(join(out, 'report.json'), typeof body === 'string' ? body : JSON.stringify(body));
const video = (name, size) => mkdir(join(out, name, '..'), { recursive: true }).then(() => writeFile(join(out, name), 'v'.repeat(size)));

if (scenario === 'crash') {
  console.error('\\u001b[31mError\\u001b[0m: the session expired');
  process.exit(3);
}
if (scenario === 'hang') {
  spawn(process.execPath, ['-e', "setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'survived'), 1500)", join(out, 'grandchild.txt')], { stdio: 'ignore' });
  setInterval(() => undefined, 1000);
} else if (scenario === 'no-report') {
  await video('film.webm', 5);
} else if (scenario === 'broken-report') {
  await report('{not json');
  await video('film.webm', 5);
} else if (scenario === 'skipped') {
  await report({ status: 'skipped', reason: 'the sandbox account is locked' });
  await video('film.webm', 5);
} else if (scenario === 'no-video') {
  await report({ status: 'recorded' });
} else {
  await report({ status: 'recorded', facts: [{ label: 'Items in the cart', value: 2 }], keyFrames: ['screens/b-key.png'] });
  await video('small.mp4', 5);
  await video('run/large.webm', 50);
  await mkdir(join(out, 'screens'), { recursive: true });
  for (const name of ['a-first.png', 'b-key.png', 'z-last.svg']) await writeFile(join(out, 'screens', name), 'image');
  if (options.replay !== undefined || scenario === 'writes-replay') await writeFile(join(out, 'replay.json'), '{"choices":[1]}');
}
`;

describe('CommandFilmRecorder', () => {
  let tools = '';
  let output = '';

  function film(overrides: Partial<FilmSettings> = {}): FilmSettings {
    return {
      command: [process.execPath, TOOL_FILE, '--ref', '{ref}', '--out', '{output}', '--scenario', '{scenario}', '--replay', '{replay}'],
      workingDirectory: tools,
      environment: {},
      timeoutMs: GENEROUS_TIMEOUT_MS,
      replayFile: REPLAY_FILE,
      timeZone: 'UTC',
      ...overrides,
    };
  }

  function recorder(settings: FilmSettings = film(), operatorEnvironment: Readonly<Record<string, string | undefined>> = {}): CommandFilmRecorder {
    return new CommandFilmRecorder(new SpawnCommandRunner({ killGraceMs: 200 }), { film: settings, operatorEnvironment });
  }

  function request(scenario: string, replayPath: string | null = null): FilmRequest {
    return { ref: 'abc1234', outputDirectory: output, scenario, replayPath };
  }

  async function invocation(): Promise<{ argv: string[]; cwd: string; token: string | null; key: string | null; override: string | null }> {
    return JSON.parse(await readFile(join(output, 'invocation.txt'), 'utf8')) as never;
  }

  beforeEach(async () => {
    tools = await mkdtemp(join(tmpdir(), 'film-tool-'));
    output = join(await mkdtemp(join(tmpdir(), 'film-output-')), 'out');
    await writeFile(join(tools, TOOL_FILE), FILM_TOOL);
  });
  afterEach(async () => {
    await rm(tools, { recursive: true, force: true });
    await rm(join(output, '..'), { recursive: true, force: true });
  });

  it('runs the command in its working directory with the placeholders filled in, and reads what it wrote', async () => {
    const recording = await recorder().record(request('checkout-flow'));

    expect((await invocation()).argv).toEqual(['--ref', 'abc1234', '--out', output, '--scenario', 'checkout-flow']);
    expect((await invocation()).cwd).toContain('film-tool-');
    expect(recording).toEqual({
      facts: [{ label: 'Items in the cart', value: '2' }],
      videoPath: 'run/large.webm',
      screenshotPaths: ['screens/z-last.svg', 'screens/b-key.png'],
      wroteReplay: false,
    });
  });

  it('gives the second recording the replay file of the first, and tells whether the first one wrote it', async () => {
    const first = await recorder().record(request('writes-replay'));
    expect(first.wroteReplay).toBe(true);

    const replayPath = join(output, REPLAY_FILE);
    await rm(output, { recursive: true, force: true });
    await recorder().record(request('checkout-flow', replayPath));
    expect((await invocation()).argv).toEqual(['--ref', 'abc1234', '--out', output, '--scenario', 'checkout-flow', '--replay', replayPath]);
  });

  it('runs with the operator environment, the variables of the film on top, and without filtering what looks like a credential', async () => {
    await recorder(film({ environment: { FILM_API_KEY: 'sandbox-key', OVERRIDDEN: 'film' } }), { OPERATOR_SESSION: 'session-1', OVERRIDDEN: 'operator', PATH: process.env['PATH'] }).record(request('checkout-flow'));

    expect(await invocation()).toMatchObject({ token: 'session-1', key: 'sandbox-key', override: 'film' });
  });

  it('runs the command at a lower priority', async () => {
    const commands: (readonly string[])[] = [];
    const spy = { run: (command: readonly string[]) => (commands.push(command), Promise.reject(new Error('stop here'))) };
    await expect(new CommandFilmRecorder(spy, { film: film(), operatorEnvironment: {} }).record(request('checkout-flow'))).rejects.toThrow('stop here');
    expect(commands[0]?.slice(0, 3)).toEqual(['nice', '-n', '10']);
  });

  it('fails with the end of the error output of a command that exits with an error, without colour codes', async () => {
    await expect(recorder().record(request('crash'))).rejects.toThrow('the film command exited with 3: Error: the session expired');
  });

  it('fails when the command wrote no report', async () => {
    await expect(recorder().record(request('no-report'))).rejects.toThrow('wrote no report.json');
  });

  it('fails when the report is unreadable', async () => {
    await expect(recorder().record(request('broken-report'))).rejects.toThrow('report.json is not a readable film report');
  });

  it('fails when the command wrote no video', async () => {
    await expect(recorder().record(request('no-video'))).rejects.toThrow('wrote no video (.mp4, .webm, .mov, .mkv)');
  });

  it('fails with its reason when the report says the scenario was skipped', async () => {
    await expect(recorder().record(request('skipped'))).rejects.toThrow('the scenario was skipped: the sandbox account is locked');
  });

  it('stops a command that outlives its timeout, with its whole process group', async () => {
    const failure = await recorder(film({ timeoutMs: SHORT_TIMEOUT_MS })).record(request('hang')).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FilmRecordingError);
    expect((failure as Error).message).toContain('did not finish within');
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await expect(access(join(output, 'grandchild.txt'))).rejects.toThrow();
  });

  it('fails with what the system says when the command does not exist', async () => {
    await expect(recorder(film({ command: ['no-such-film-tool-anywhere'] })).record(request('checkout-flow'))).rejects.toThrow(
      /the film command exited with 127: .*no-such-film-tool-anywhere/,
    );
  });

  it('fails clearly when the command cannot even be started', async () => {
    const unstartable = { run: (command: readonly string[]) => Promise.reject(new CommandSpawnError(command, new Error('spawn nice ENOENT'))) };
    await expect(new CommandFilmRecorder(unstartable, { film: film(), operatorEnvironment: {} }).record(request('checkout-flow'))).rejects.toThrow(
      'the film command could not be started',
    );
  });

  it('creates the output directory the command writes into', async () => {
    await mkdir(join(output, '..'), { recursive: true });
    await recorder().record(request('checkout-flow'));
    await expect(access(output)).resolves.toBeUndefined();
  });
});
