import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex, verifyFrozenChecks } from './frozen-checks.ts';

const CHECK_CONTENT = 'expect(sum(1, 2)).toBe(3);\n';

describe('verifyFrozenChecks', () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), 'frozen-checks-'));
    await mkdir(join(worktree, 'checks'));
    await writeFile(join(worktree, 'checks', 'sum.test.ts'), CHECK_CONTENT);
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it('accepts files whose content still matches the frozen hash', async () => {
    const violations = await verifyFrozenChecks(worktree, [{ path: 'checks/sum.test.ts', sha256: sha256Hex(CHECK_CONTENT) }]);
    expect(violations).toEqual([]);
  });

  it('reports a modified check', async () => {
    await writeFile(join(worktree, 'checks', 'sum.test.ts'), 'expect(true).toBe(true);\n');
    const violations = await verifyFrozenChecks(worktree, [{ path: 'checks/sum.test.ts', sha256: sha256Hex(CHECK_CONTENT) }]);
    expect(violations).toEqual([{ path: 'checks/sum.test.ts', kind: 'modified' }]);
  });

  it('reports a deleted check as missing', async () => {
    await rm(join(worktree, 'checks', 'sum.test.ts'));
    const violations = await verifyFrozenChecks(worktree, [{ path: 'checks/sum.test.ts', sha256: sha256Hex(CHECK_CONTENT) }]);
    expect(violations).toEqual([{ path: 'checks/sum.test.ts', kind: 'missing' }]);
  });

  it('reports a check replaced by a directory as missing', async () => {
    await rm(join(worktree, 'checks', 'sum.test.ts'));
    await mkdir(join(worktree, 'checks', 'sum.test.ts'));
    const violations = await verifyFrozenChecks(worktree, [{ path: 'checks/sum.test.ts', sha256: sha256Hex(CHECK_CONTENT) }]);
    expect(violations).toEqual([{ path: 'checks/sum.test.ts', kind: 'missing' }]);
  });

  it('reports every violation, not only the first', async () => {
    const violations = await verifyFrozenChecks(worktree, [
      { path: 'checks/sum.test.ts', sha256: sha256Hex('other') },
      { path: 'checks/absent.test.ts', sha256: sha256Hex(CHECK_CONTENT) },
    ]);
    expect(violations).toEqual([
      { path: 'checks/sum.test.ts', kind: 'modified' },
      { path: 'checks/absent.test.ts', kind: 'missing' },
    ]);
  });
});
