import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDecisionRequest } from './decision-request.ts';

describe('readDecisionRequest', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'decision-request-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns the trimmed request the agent wrote', async () => {
    const file = join(directory, 'human-decision.md');
    await writeFile(file, '\nMay I write a custom refresh handler?\n\n');

    expect(await readDecisionRequest(file)).toBe('May I write a custom refresh handler?');
  });

  it('ignores a blank request', async () => {
    const file = join(directory, 'human-decision.md');
    await writeFile(file, '  \n');

    expect(await readDecisionRequest(file)).toBeNull();
  });

  it('returns null when no request was written or none is allowed', async () => {
    expect(await readDecisionRequest(join(directory, 'absent.md'))).toBeNull();
    expect(await readDecisionRequest(null)).toBeNull();
  });

  it('fails when the request cannot be read for another reason', async () => {
    await expect(readDecisionRequest(directory)).rejects.toThrow();
  });
});
