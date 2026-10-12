import { resolve } from 'node:path';
import type { GatePolicy } from '../gate/gate-policy.ts';
import { canonicalPath } from '../paths/canonical-path.ts';
import type { PreToolUseHookPayload } from './hook-payloads.ts';

const FROZEN_WRITE_REFUSAL = 'is a frozen acceptance check and cannot be modified.';

export type FrozenWriteDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export function decideFrozenWrite(payload: PreToolUseHookPayload, policy: GatePolicy): FrozenWriteDecision {
  const frozenPaths = new Map(
    policy.frozenChecks.map((check) => [canonicalPath(resolve(policy.worktree, check.path)), check.path]),
  );
  const targets = [payload.tool_input.file_path, payload.tool_input.notebook_path].filter(
    (target) => target !== undefined,
  );
  for (const target of targets) {
    const frozenPath = frozenPaths.get(canonicalPath(resolve(policy.worktree, target)));
    if (frozenPath !== undefined) {
      return { allowed: false, reason: `${frozenPath} ${FROZEN_WRITE_REFUSAL}` };
    }
  }
  return { allowed: true };
}
