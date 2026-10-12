import { describe, expect, it } from 'vitest';
import { SpawnCommandRunner } from './spawnCommandRunner.ts';
import { CommandAbortedError, CommandSpawnError, EmptyCommandError } from './errors.ts';

const NODE = process.execPath;
const GENEROUS_TIMEOUT_MS = 30_000;
const SHORT_TIMEOUT_MS = 600;
const TEST_KILL_GRACE_MS = 200;
const SMALL_OUTPUT_LIMIT_BYTES = 1_000;
const FLOOD_SIZE = 100_000;
const TEST_CWD = process.cwd();

describe('SpawnCommandRunner', () => {
  const runner = new SpawnCommandRunner({ killGraceMs: TEST_KILL_GRACE_MS });

  it('captures stdout, stderr, exit code and duration', async () => {
    const result = await runner.run(
      [NODE, '-e', "console.log('out'); console.error('err'); process.exit(3)"],
      TEST_CWD,
      GENEROUS_TIMEOUT_MS,
      {},
    );
    expect(result.exitCode).toBe(3);
    expect(result.stdout.trim()).toBe('out');
    expect(result.stderr.trim()).toBe('err');
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs in the requested working directory', async () => {
    const result = await runner.run([NODE, '-e', 'console.log(process.cwd())'], '/', GENEROUS_TIMEOUT_MS, {});
    expect(result.stdout.trim()).toBe('/');
  });

  it('does not use a shell', async () => {
    const result = await runner.run([NODE, '-e', 'console.log(process.argv[1])', '$HOME; echo pwned'], TEST_CWD, GENEROUS_TIMEOUT_MS, {});
    expect(result.stdout.trim()).toBe('$HOME; echo pwned');
  });

  it('passes only the explicit environment', async () => {
    process.env['AGENT_FACTORY_TEST_SECRET'] = 'leak';
    try {
      const result = await runner.run(
        [NODE, '-e', 'console.log(JSON.stringify(process.env))'],
        TEST_CWD,
        GENEROUS_TIMEOUT_MS,
        { ONLY_THIS: 'yes' },
      );
      const seen: unknown = JSON.parse(result.stdout);
      expect(seen).toEqual(expect.objectContaining({ ONLY_THIS: 'yes' }));
      expect(seen).not.toHaveProperty('AGENT_FACTORY_TEST_SECRET');
    } finally {
      delete process.env['AGENT_FACTORY_TEST_SECRET'];
    }
  });

  it('terminates a command that exceeds its timeout', async () => {
    const result = await runner.run([NODE, '-e', 'setInterval(() => {}, 1000)'], TEST_CWD, SHORT_TIMEOUT_MS, {});
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('kills a command that ignores SIGTERM', async () => {
    const script = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
    const result = await runner.run([NODE, '-e', script], TEST_CWD, SHORT_TIMEOUT_MS, {});
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(SHORT_TIMEOUT_MS);
  });

  it('keeps only the last bytes of a flood of output', async () => {
    const bounded = new SpawnCommandRunner({ maxOutputBytes: SMALL_OUTPUT_LIMIT_BYTES });
    const script = `process.stdout.write('a'.repeat(${FLOOD_SIZE}) + 'END')`;
    const result = await bounded.run([NODE, '-e', script], TEST_CWD, GENEROUS_TIMEOUT_MS, {});
    expect(result.stdout).toHaveLength(SMALL_OUTPUT_LIMIT_BYTES);
    expect(result.stdout.endsWith('END')).toBe(true);
  });

  it('stops a running command and refuses new ones once the factory shuts down', async () => {
    const controller = new AbortController();
    const abortable = new SpawnCommandRunner({ killGraceMs: TEST_KILL_GRACE_MS, abortSignal: controller.signal });
    const child = abortable.run([NODE, '-e', "process.on('SIGTERM', () => undefined); console.log(process.pid); setInterval(() => undefined, 1000)"], TEST_CWD, GENEROUS_TIMEOUT_MS, {});
    await new Promise((resolve) => setTimeout(resolve, SHORT_TIMEOUT_MS));
    controller.abort();
    await expect(child).rejects.toBeInstanceOf(CommandAbortedError);
    await expect(abortable.run([NODE, '-e', ''], TEST_CWD, GENEROUS_TIMEOUT_MS, {})).rejects.toBeInstanceOf(CommandAbortedError);
  });

  it('rejects an empty command', async () => {
    await expect(runner.run([], TEST_CWD, GENEROUS_TIMEOUT_MS, {})).rejects.toBeInstanceOf(EmptyCommandError);
  });

  it('rejects when the executable does not exist', async () => {
    await expect(runner.run(['/nonexistent/binary'], TEST_CWD, GENEROUS_TIMEOUT_MS, {})).rejects.toBeInstanceOf(CommandSpawnError);
  });
});
