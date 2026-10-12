import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../gate/frozen-checks.ts';
import type { GatePolicy } from '../gate/gate-policy.ts';
import { decideFrozenWrite } from './frozen-write-guard.ts';
import type { PreToolUseHookPayload } from './hook-payloads.ts';

const FROZEN_PATH = 'checks/sum.test.ts';

describe('decideFrozenWrite', () => {
  let root: string;
  let worktree: string;
  let policy: GatePolicy;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'frozen-guard-')));
    worktree = join(root, 'worktree');
    await mkdir(join(worktree, 'checks'), { recursive: true });
    await writeFile(join(worktree, FROZEN_PATH), 'frozen');
    policy = {
      worktree,
      frozenChecks: [{ path: FROZEN_PATH, sha256: sha256Hex('frozen') }],
      gateCommand: null,
      gateTimeoutMs: 1_000,
      decisionLogPath: join(root, 'decisions.jsonl'),
      decisionRequestFile: null,
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function payload(toolName: string, toolInput: PreToolUseHookPayload['tool_input']): PreToolUseHookPayload {
    return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, cwd: worktree };
  }

  it('refuses an edit of a frozen check given by absolute path', () => {
    const decision = decideFrozenWrite(payload('Edit', { file_path: join(worktree, FROZEN_PATH) }), policy);
    expect(decision).toEqual({ allowed: false, reason: `${FROZEN_PATH} is a frozen acceptance check and cannot be modified.` });
  });

  it('refuses a write given by a path relative to the worktree', () => {
    expect(decideFrozenWrite(payload('Write', { file_path: './checks/../checks/sum.test.ts' }), policy).allowed).toBe(false);
  });

  it('refuses a notebook edit targeting a frozen check', () => {
    expect(decideFrozenWrite(payload('NotebookEdit', { notebook_path: FROZEN_PATH }), policy).allowed).toBe(false);
  });

  it('refuses a write through a symbolic link to the worktree', async () => {
    const alias = join(root, 'alias');
    await symlink(worktree, alias);
    expect(decideFrozenWrite(payload('Write', { file_path: join(alias, FROZEN_PATH) }), policy).allowed).toBe(false);
  });

  it('allows writes to other files, including new ones', () => {
    expect(decideFrozenWrite(payload('Write', { file_path: join(worktree, 'src', 'sum.ts') }), policy)).toEqual({ allowed: true });
  });
});
