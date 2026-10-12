import { fileURLToPath } from 'node:url';

export const HOOK_SCRIPTS = {
  stopGate: fileURLToPath(new URL('../hooks/stop-gate.ts', import.meta.url)),
  frozenWriteGuard: fileURLToPath(new URL('../hooks/frozen-write-guard.ts', import.meta.url)),
} as const;
