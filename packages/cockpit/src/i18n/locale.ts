export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'cockpit.language';
export const LOCALE_QUERY_PARAMETER = 'lang';

/** The BCP 47 tag each language formats numbers and dates with. */
export const LOCALE_TAGS: Readonly<Record<Locale, string>> = { en: 'en-US', fr: 'fr-FR' };

/** Each language is named in itself, so the switch is readable whatever language is active. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', fr: 'Français' };
export const LOCALE_CODES: Readonly<Record<Locale, string>> = { en: 'EN', fr: 'FR' };

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function readStoredLocale(storage: Storage | null): Locale | null {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY) ?? null;
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function persistLocale(storage: Storage | null, locale: Locale): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    return;
  }
}

/** The address bar wins, then the language the operator chose before, then English. */
export function resolveInitialLocale(search: string, storage: Storage | null): Locale {
  const requested = new URLSearchParams(search).get(LOCALE_QUERY_PARAMETER);
  if (isLocale(requested)) return requested;
  return readStoredLocale(storage) ?? DEFAULT_LOCALE;
}
