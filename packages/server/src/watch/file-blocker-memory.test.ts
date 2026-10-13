import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BLOCKER_KINDS, blockerKey, type Blocker } from './blocker.ts';
import type { ReportedBlocker } from './blocker-memory.ts';
import { FileBlockerMemory, WATCH_BLOCKERS_FILE } from './file-blocker-memory.ts';

const REPORTED_AT = new Date('2026-10-12T14:00:00.000Z');
const ESCALATED: Blocker = {
  key: blockerKey(BLOCKER_KINDS.needsHuman, 'storefront', 12, '2026-10-12T13:30:00.000Z'),
  kind: BLOCKER_KINDS.needsHuman,
  project: 'storefront',
  issue: 12,
  detail: 'the gate failed',
};
const OUTAGE: Blocker = { key: blockerKey(BLOCKER_KINDS.cockpitUnreachable), kind: BLOCKER_KINDS.cockpitUnreachable, project: null, issue: null, detail: 'ECONNREFUSED' };
const reported = (blocker: Blocker): ReportedBlocker => ({ blocker, reportedAt: REPORTED_AT });

describe('FileBlockerMemory', () => {
  let state: string;
  let memory: FileBlockerMemory;

  beforeEach(async () => {
    state = await mkdtemp(join(tmpdir(), 'factory-watch-memory-'));
    memory = new FileBlockerMemory(state);
  });
  afterEach(async () => {
    await rm(state, { recursive: true, force: true });
  });

  it('remembers nothing before a watch recorded anything', async () => {
    expect(await memory.recall()).toEqual([]);
  });

  it('gives back the blockers recorded, each with the time it was reported', async () => {
    await memory.remember([reported(ESCALATED), reported(OUTAGE)]);
    expect(await new FileBlockerMemory(state).recall()).toEqual([reported(ESCALATED), reported(OUTAGE)]);
  });

  it('keeps one small file in the state directory, with the keys and the time each was reported', async () => {
    await memory.remember([reported(ESCALATED)]);
    expect(await readdir(state)).toEqual([WATCH_BLOCKERS_FILE]);
    expect(JSON.parse(await readFile(join(state, WATCH_BLOCKERS_FILE), 'utf8'))).toEqual({
      blockers: [{ key: ESCALATED.key, kind: 'needs-human', project: 'storefront', issue: 12, detail: 'the gate failed', reportedAt: '2026-10-12T14:00:00.000Z' }],
    });
  });

  it('replaces what it kept, and keeps nothing once every blocker cleared', async () => {
    await memory.remember([reported(ESCALATED)]);
    await memory.remember([]);
    expect(await memory.recall()).toEqual([]);
  });

  it('is empty when the file cannot be read back: the watch then reports what it finds', async () => {
    const path = join(state, WATCH_BLOCKERS_FILE);
    for (const content of ['', '{', '[]', '{"blockers":[{"key":"x"}]}', '{"blockers":[{"key":"k","kind":"a-new-kind","project":null,"issue":null,"detail":"","reportedAt":"2026-10-12T14:00:00.000Z"}]}']) {
      await writeFile(path, content);
      expect(await memory.recall(), content).toEqual([]);
    }
  });
});
