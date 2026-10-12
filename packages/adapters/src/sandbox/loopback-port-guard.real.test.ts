import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeatbeltCommandSandbox } from './seatbelt-command-sandbox.ts';

const run = promisify(execFile);
const REAL_SANDBOX_ENABLED = process.env['AGENT_FACTORY_REAL_SANDBOX'] === '1';
const DUAL_STACK_ADDRESS = '::';
const REACHED_BODY = 'reached';
const CURL_TIMEOUT_SECONDS = 8;
const TEST_TIMEOUT_MS = 90_000;
const INTERNET_URL = 'https://example.com';
const SECRET = 'factory-credential-canary';
const LAUNCHD_SOCKET_GLOBS = ['/private/var/run/com.apple.launchd.*/Listeners', '/private/tmp/com.apple.launchd.*/Listeners'];
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

interface Listener {
  readonly server: Server;
  readonly port: number;
}

function listen(): Promise<Listener> {
  return new Promise((resolve, reject) => {
    const server = createServer((_request, response) => response.end(REACHED_BODY));
    server.once('error', reject);
    server.listen(0, DUAL_STACK_ADDRESS, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') reject(new Error('the throwaway server has no TCP address'));
      else resolve({ server, port: address.port });
    });
  });
}

function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

describe.skipIf(!REAL_SANDBOX_ENABLED)('factory port guard', () => {
  let root: string;
  let worktree: string;
  let credentials: string;
  let factory: Listener;
  let neighbour: Listener;
  let sandbox: SeatbeltCommandSandbox;

  async function confined(network: boolean, script: string): Promise<string> {
    const command = sandbox.confine(['/bin/sh', '-c', script], { workingDirectory: worktree, network });
    const [executable, ...args] = command;
    return (await run(executable ?? '', args, { timeout: TEST_TIMEOUT_MS })).stdout.trim();
  }

  async function fetchBody(network: boolean, url: string): Promise<string> {
    return confined(network, `curl -s --max-time ${CURL_TIMEOUT_SECONDS} ${url} || true`);
  }

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-port-guard-')));
    worktree = join(root, 'worktree');
    credentials = join(root, 'credentials');
    await mkdir(worktree);
    await mkdir(credentials);
    await writeFile(join(credentials, 'token'), SECRET);
    [factory, neighbour] = await Promise.all([listen(), listen()]);
    sandbox = new SeatbeltCommandSandbox({
      deniedReads: [{ path: credentials, prefix: false }],
      writableDirectories: [],
      temporaryDirectories: [],
      blockedPorts: () => [factory.port],
    });
  });

  afterAll(async () => {
    await Promise.all([factory, neighbour].map((listener) => close(listener.server)));
    await rm(root, { recursive: true, force: true });
  });

  it('answers the neighbour to an unconfined client, so a refusal below is the sandbox', async () => {
    for (const host of LOOPBACK_HOSTS) {
      const { stdout } = await run('curl', ['-s', '--max-time', `${CURL_TIMEOUT_SECONDS}`, `http://${host}:${factory.port}`]);
      expect(stdout, host).toBe(REACHED_BODY);
    }
  }, TEST_TIMEOUT_MS);

  it.each([false, true])('refuses the factory port on every loopback address (network: %s)', async (network) => {
    for (const host of LOOPBACK_HOSTS) expect(await fetchBody(network, `http://${host}:${factory.port}`), `${host} network=${network}`).toBe('');
  }, TEST_TIMEOUT_MS);

  it.each([false, true])('still reaches another loopback port (network: %s)', async (network) => {
    for (const host of LOOPBACK_HOSTS) expect(await fetchBody(network, `http://${host}:${neighbour.port}`), `${host} network=${network}`).toBe(REACHED_BODY);
  }, TEST_TIMEOUT_MS);

  it('refuses the internet without the network grant', async () => {
    expect(await fetchBody(false, INTERNET_URL)).toBe('');
  }, TEST_TIMEOUT_MS);

  it('reaches the internet with the network grant while the factory port stays refused', async () => {
    expect(await fetchBody(true, INTERNET_URL)).toContain('Example Domain');
    expect(await fetchBody(true, `http://127.0.0.1:${factory.port}`)).toBe('');
  }, TEST_TIMEOUT_MS);

  it.each([false, true])('keeps the launchd sockets closed, the ssh agent among them (network: %s)', async (network) => {
    const reached = await confined(
      network,
      `for socket in ${LAUNCHD_SOCKET_GLOBS.join(' ')}; do [ -S "$socket" ] || continue; SSH_AUTH_SOCK="$socket" ssh-add -l >/dev/null 2>&1; case $? in 0 | 1) echo reached ;; esac; done`,
    );
    expect(reached).toBe('');
  }, TEST_TIMEOUT_MS);

  it('keeps credential reads refused', async () => {
    expect(await confined(true, `cat ${credentials}/token 2>/dev/null || true`)).not.toContain(SECRET);
  }, TEST_TIMEOUT_MS);
});
