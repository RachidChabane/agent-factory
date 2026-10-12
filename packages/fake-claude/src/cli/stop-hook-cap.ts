export const STOP_HOOK_BLOCK_CAP_VARIABLE = 'CLAUDE_CODE_STOP_HOOK_BLOCK_CAP';
export const DEFAULT_STOP_HOOK_BLOCK_CAP = 2;

const DIGITS_ONLY = /^\d+$/;
const DECIMAL_RADIX = 10;

export function stopHookBlockCapOf(environment: NodeJS.ProcessEnv): number {
  const configured = environment[STOP_HOOK_BLOCK_CAP_VARIABLE]?.trim();
  return configured !== undefined && DIGITS_ONLY.test(configured) ? Number.parseInt(configured, DECIMAL_RADIX) : DEFAULT_STOP_HOOK_BLOCK_CAP;
}
