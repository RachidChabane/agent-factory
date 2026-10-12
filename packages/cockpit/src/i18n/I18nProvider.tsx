import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { safeLocalStorage } from '../platform/storage.ts';
import type { I18n } from './create-i18n.ts';
import { createI18n } from './create-i18n.ts';
import type { Locale } from './locale.ts';
import { persistLocale } from './locale.ts';

export interface LocalizedI18n extends I18n {
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<LocalizedI18n | null>(null);

interface I18nProviderProps {
  readonly initialLocale: Locale;
  /** An IANA zone to format times in; the browser's own zone when absent. */
  readonly timeZone?: string | undefined;
  readonly storage?: Storage | null | undefined;
  readonly children: ReactNode;
}

export function I18nProvider({ initialLocale, timeZone, storage, children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const i18n = useMemo(() => createI18n(locale, timeZone), [locale, timeZone]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      persistLocale(storage === undefined ? safeLocalStorage() : storage, next);
    },
    [storage],
  );
  const value = useMemo<LocalizedI18n>(() => ({ ...i18n, setLocale }), [i18n, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): LocalizedI18n {
  const value = useContext(I18nContext);
  if (value === null) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
