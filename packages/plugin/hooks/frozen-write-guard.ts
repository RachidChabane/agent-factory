import { argv, stdin, stdout } from 'node:process';
import { readGatePolicy } from '../src/gate/gate-policy.ts';
import { decideFrozenWrite } from '../src/hooks/frozen-write-guard.ts';
import { PreToolUseHookPayloadSchema, preToolUseDeny } from '../src/hooks/hook-payloads.ts';
import { policyPathFrom, readAll, writeJson } from '../src/hooks/hook-io.ts';

const GUARD_UNAVAILABLE_REASON = 'This write could not be checked against the frozen acceptance checks, so it is refused.';

async function main(): Promise<void> {
  try {
    const payload = PreToolUseHookPayloadSchema.parse(JSON.parse(await readAll(stdin)));
    const policy = await readGatePolicy(policyPathFrom(argv));
    const decision = decideFrozenWrite(payload, policy);
    if (!decision.allowed) {
      await writeJson(stdout, preToolUseDeny(decision.reason));
    }
  } catch {
    await writeJson(stdout, preToolUseDeny(GUARD_UNAVAILABLE_REASON));
  }
}

await main();
