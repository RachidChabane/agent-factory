import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FrozenCheck } from '@agent-factory/domain';

const HASH_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const FILE_NOT_FOUND = 'ENOENT';
const NOT_A_FILE = 'EISDIR';

export const FROZEN_CHECK_VIOLATIONS = ['modified', 'missing'] as const;
export type FrozenCheckViolationKind = (typeof FROZEN_CHECK_VIOLATIONS)[number];

export interface FrozenCheckViolation {
  readonly path: string;
  readonly kind: FrozenCheckViolationKind;
}

export function sha256Hex(content: Buffer | string): string {
  return createHash(HASH_ALGORITHM).update(content).digest(HEX_ENCODING);
}

export async function verifyFrozenChecks(
  worktree: string,
  checks: readonly FrozenCheck[],
): Promise<readonly FrozenCheckViolation[]> {
  const violations = await Promise.all(checks.map((check) => violationOf(worktree, check)));
  return violations.filter((violation) => violation !== null);
}

async function violationOf(worktree: string, check: FrozenCheck): Promise<FrozenCheckViolation | null> {
  const content = await readIfPresent(resolve(worktree, check.path));
  if (content === null) {
    return { path: check.path, kind: 'missing' };
  }
  return sha256Hex(content) === check.sha256 ? null : { path: check.path, kind: 'modified' };
}

async function readIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (isErrorWithCode(error, FILE_NOT_FOUND) || isErrorWithCode(error, NOT_A_FILE)) {
      return null;
    }
    throw error;
  }
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
