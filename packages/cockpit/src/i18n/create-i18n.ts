import type { ReactNode } from 'react';
import type { Catalog, MessageKey } from './catalog/index.ts';
import { CATALOGS } from './catalog/index.ts';
import type { TranslateArguments } from './catalog/types.ts';
import type { Formatters } from './formatters.ts';
import { createFormatters } from './formatters.ts';
import type { Locale } from './locale.ts';
import type { RichParameters, TextParameters } from './translate.ts';
import { createTranslator } from './translate.ts';

const JUST_NOW_KEY = 'time.justNow';

export type Translate = <Key extends MessageKey>(key: Key, ...args: TranslateArguments<Catalog[Key]>) => string;
export type RichTranslate = <Key extends MessageKey>(key: Key, params: RichParameters) => ReactNode;

export interface I18n {
  readonly locale: Locale;
  readonly t: Translate;
  /** Like `t`, with elements instead of text for the placeholders. */
  readonly rich: RichTranslate;
  readonly has: (key: string) => boolean;
  readonly fmt: Formatters;
}

export function createI18n(locale: Locale, timeZone?: string): I18n {
  const translator = createTranslator(locale, CATALOGS[locale]);
  const t: Translate = (key, ...args) => translator.text(key, args[0] as TextParameters | undefined);
  const fmt = createFormatters(locale, { justNow: translator.text(JUST_NOW_KEY) }, timeZone);
  return { locale, t, rich: (key, params) => translator.rich(key, params), has: translator.has, fmt };
}
