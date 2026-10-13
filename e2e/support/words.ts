import { createI18n, type I18n } from '../../packages/cockpit/src/i18n/create-i18n.ts';
import type { Locale } from '../../packages/cockpit/src/i18n/locale.ts';
import { BROWSER_TIME_ZONE } from './formats.ts';

/** The cockpit's own words in a language, read from its catalogue: a spec asks for a sentence there instead of retyping it. */
export function wordsIn(locale: Locale): I18n {
  return createI18n(locale, BROWSER_TIME_ZONE);
}
