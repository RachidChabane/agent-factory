import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  BUBBLEWRAP_EXECUTABLE,
  createCommandSandbox,
  EventSourcedIssueStateStore,
  FileLogArchive,
  SpawnCommandRunner,
  SpawnServiceProcesses,
} from '@agent-factory/adapters';
import { IssueJournalWriter, IssueStacks, ProjectEventStore, ShellCommands, StackSlots, STACK_EVENTS, type StackSettings } from '@agent-factory/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openEventLog } from '../installation/event-log.ts';

const DARWIN = 'darwin';
const LINUX = 'linux';
const ISSUE = 7;
const BASE_PORT = 47_000;
const COMMAND_TIMEOUT_MS = 60_000;
const SERVER = `
const port = 47000 + Number(process.env.AGENT_FACTORY_SLOT);
require('node:http').createServer((request, response) => response.end('catalogue up')).listen(port, '127.0.0.1', () => console.log('serving on ' + port));
`;

function onPath(executable: string): boolean {
  return (process.env['PATH'] ?? '').split(delimiter).some((directory) => directory !== '' && existsSync(join(directory, executable)));
}

const CONFINEMENT_AVAILABLE =
  (process.platform === DARWIN && process.env['AGENT_FACTORY_REAL_SANDBOX'] === '1') || (process.platform === LINUX && onPath(BUBBLEWRAP_EXECUTABLE));

describe.skipIf(!CONFINEMENT_AVAILABLE)('the stack of an issue, with real processes in the real sandbox', () => {
  let root: string;
  let workspace: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-stack-')));
    workspace = join(root, 'worktree');
    await mkdir(workspace);
    await writeFile(join(workspace, 'server.js'), SERVER);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('starts the service until it answers, lets a confined check reach it on the loopback, then stops it', async () => {
    const settings: StackSettings = {
      setup: [{ name: 'prepare', run: 'echo prepared > setup.txt' }],
      services: [{ name: 'catalogue', run: `"${process.execPath}" server.js`, ready: { run: `"${process.execPath}" -e "fetch('http://127.0.0.1:' + (${BASE_PORT} + Number(process.env.AGENT_FACTORY_SLOT))).then(() => process.exit(0), () => process.exit(1))"`, timeoutMs: 30_000 } }],
      teardown: [{ name: 'clean', run: 'rm -f setup.txt' }],
      environment: { CATALOGUE_NAME: 'storefront' },
      issueTypes: [],
      stopGraceMs: 2_000,
    };
    const sandbox = createCommandSandbox(process.platform, { deniedReads: [], writableDirectories: [], temporaryDirectories: [], blockedPorts: () => [] });
    const shell = new ShellCommands(new SpawnCommandRunner(), sandbox, { PATH: process.env['PATH'] ?? '' }, COMMAND_TIMEOUT_MS, null);
    const eventLog = openEventLog(join(root, 'state'));
    const events = new ProjectEventStore(eventLog.events, 'storefront');
    const logs = new FileLogArchive(join(root, 'logs'));
    const stacks = new IssueStacks({ services: new SpawnServiceProcesses(join(root, 'service-logs')), logs, slots: new StackSlots() }, settings, shell);
    const writer = new IssueJournalWriter(events, new EventSourcedIssueStateStore(events), ISSUE);
    const reached = await stacks.around(writer, ISSUE, 'ui', workspace, async (stack) => {
      expect(await readFile(join(workspace, 'setup.txt'), 'utf8')).toBe('prepared\n');
      const probe = `"${process.execPath}" -e "fetch('http://127.0.0.1:' + (${BASE_PORT} + Number(process.env.AGENT_FACTORY_SLOT))).then((r) => r.text()).then((t) => console.log(t + ' for ' + process.env.CATALOGUE_NAME))"`;
      const outcome = await stack?.shell.execute(probe, workspace);
      return outcome?.kind === 'completed' ? outcome.output : '';
    });
    expect(reached).toBe('catalogue up for storefront');
    await expect(fetch(`http://127.0.0.1:${BASE_PORT}`)).rejects.toThrow();
    expect(existsSync(join(workspace, 'setup.txt'))).toBe(false);
    expect(await logs.read(ISSUE, 'stack-catalogue.log')).toContain(`serving on ${BASE_PORT}`);
    expect((await events.read('issue/', 0)).map((record) => record.type)).toEqual([STACK_EVENTS.started, STACK_EVENTS.stopped]);
    eventLog.close();
  });
});
