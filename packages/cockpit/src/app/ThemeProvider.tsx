import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { safeLocalStorage } from '../platform/storage.ts';
import type { Theme } from './theme.ts';
import { applyTheme, persistTheme } from './theme.ts';

interface ThemeApi {
  readonly theme: Theme;
  toggle(): void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ initial, children }: { readonly initial: Theme; readonly children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => applyTheme(theme), [theme]);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      persistTheme(safeLocalStorage(), next);
      return next;
    });
  }, []);
  const api = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const api = useContext(ThemeContext);
  if (api === null) throw new Error('useTheme must be used inside ThemeProvider');
  return api;
}
