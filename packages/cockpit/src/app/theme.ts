export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'cockpit.theme';
export const THEME_QUERY_PARAMETER = 'theme';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

function isTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'light';
}

function readStored(storage: Storage | null): Theme | null {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY) ?? null;
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function resolveInitialTheme(search: string, storage: Storage | null, prefersLight: boolean): Theme {
  const requested = new URLSearchParams(search).get(THEME_QUERY_PARAMETER);
  if (isTheme(requested)) return requested;
  return readStored(storage) ?? (prefersLight ? 'light' : 'dark');
}

export function prefersLightScheme(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}

export function persistTheme(storage: Storage | null, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}
