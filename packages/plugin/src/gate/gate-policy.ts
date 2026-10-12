import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const SHA256_HEX = /^[0-9a-f]{64}$/;

export const FrozenCheckSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(SHA256_HEX),
});

export const GatePolicySchema = z.object({
  worktree: z.string().min(1),
  frozenChecks: z.array(FrozenCheckSchema),
  gateCommand: z.string().min(1).nullable(),
  gateTimeoutMs: z.number().int().positive(),
  decisionLogPath: z.string().min(1),
  decisionRequestFile: z.string().min(1).nullable(),
});

export type GatePolicy = z.infer<typeof GatePolicySchema>;

export async function readGatePolicy(policyPath: string): Promise<GatePolicy> {
  const content = await readFile(policyPath, 'utf8');
  return GatePolicySchema.parse(JSON.parse(content));
}
