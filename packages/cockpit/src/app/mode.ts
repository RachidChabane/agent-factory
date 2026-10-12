import type { CockpitMode } from './services.ts';

export const MOCK_QUERY_PARAMETER = 'mock';
export const MOCK_STORAGE_KEY = 'cockpit.mock';
const ENABLED = '1';
const DISABLED = '0';

export function resolveMode(search: string, storage: Storage | null): CockpitMode {
  const requested = new URLSearchParams(search).get(MOCK_QUERY_PARAMETER);
  try {
    if (requested === ENABLED) storage?.setItem(MOCK_STORAGE_KEY, ENABLED);
    if (requested === DISABLED) storage?.removeItem(MOCK_STORAGE_KEY);
    if (requested === null && storage?.getItem(MOCK_STORAGE_KEY) === ENABLED) return 'mock';
  } catch {
    return requested === ENABLED ? 'mock' : 'live';
  }
  return requested === ENABLED ? 'mock' : 'live';
}

export function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
