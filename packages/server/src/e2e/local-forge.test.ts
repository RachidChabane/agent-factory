import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExpectationFailed } from './expectations.ts';
import { LocalForge } from './local-forge.ts';

const SHA = '4961798ec085a3693f294496970c3b7926e925c8';
const PULL_REQUEST = {
  number: 2,
  title: 'feat(repo): filter the catalogue by category',
  head: 'factory/1-filter-the-catalogue-by-category',
  base: 'main',
  labels: ['factory'],
  closes: [1],
  state: 'merged',
  author: 'Example Factory',
  createdAt: '2026-10-12T16:43:00.000Z',
  mergeSha: 'df637812051096691237f75e5b028ada0db51917',
  mergedAt: '2026-10-12T16:44:00.000Z',
};
const ISSUE_FILE = [
  '---',
  'title: Filter the catalogue by category',
  'labels:',
  '  - factory',
  '  - validated',
  'state: closed',
  'blockedBy: []',
  'createdAt: 2026-10-12T16:42:00.000Z',
  'updatedAt: 2026-10-12T16:44:00.000Z',
  '---',
  '',
  '## Need',
  '',
  'Customers filter by category.',
  '',
].join('\n');

let directory = '';
let forge = new LocalForge(directory);

async function put(path: string, content: string): Promise<void> {
  await mkdir(join(directory, path, '..'), { recursive: true });
  await writeFile(join(directory, path), content);
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'local-forge-test-'));
  forge = new LocalForge(directory);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('LocalForge', () => {
  it('reads a pull request record', async () => {
    await put('pulls/2.json', JSON.stringify(PULL_REQUEST));
    expect(await forge.pullRequest(2)).toMatchObject({ number: 2, head: PULL_REQUEST.head, base: 'main', state: 'merged', closes: [1], mergeSha: PULL_REQUEST.mergeSha });
  });

  it('reads the front matter of an issue file', async () => {
    await put('issues/1.md', ISSUE_FILE);
    expect(await forge.issue(1)).toEqual({ title: 'Filter the catalogue by category', labels: ['factory', 'validated'], state: 'closed' });
  });

  it('fails on a record that is not there or not of its kind, and says so', async () => {
    await expect(forge.pullRequest(9)).rejects.toThrow(ExpectationFailed);
    await put('pulls/3.json', JSON.stringify({ ...PULL_REQUEST, state: 'abandoned' }));
    await expect(forge.pullRequest(3)).rejects.toThrow('pulls/3.json is a record of the local forge');
    await put('issues/4.md', 'no front matter');
    await expect(forge.issue(4)).rejects.toThrow('a front matter block between "---" lines');
  });

  it('reads the steps the gate of a commit recorded, and the log it printed', async () => {
    await put(`checks/${SHA}.json`, JSON.stringify({ sha: SHA, startedAt: '2026-10-12T16:43:01.499Z', finishedAt: '2026-10-12T16:43:02.157Z', steps: [{ name: 'lint', passed: true, durationMs: 113 }, { name: 'unit', passed: false, durationMs: 188 }] }));
    await put(`checks/${SHA}.log`, '$ node --test\n[exit code 1]\n');
    expect(await forge.gateOutcome(SHA)).toEqual({ sha: SHA, steps: [{ name: 'lint', passed: true }, { name: 'unit', passed: false }] });
    expect(await forge.gateLog(SHA)).toBe('$ node --test\n[exit code 1]\n');
  });

  it('finds no outcome for a commit whose gate has not finished writing it', async () => {
    expect(await forge.gateOutcome(SHA)).toBeNull();
    expect(await forge.gateLog(SHA)).toBeNull();
    await put(`checks/${SHA}.json`, '{ "sha": "4961');
    expect(await forge.gateOutcome(SHA)).toBeNull();
  });
});
