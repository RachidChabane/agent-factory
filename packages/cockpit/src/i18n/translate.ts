import type { ReactNode } from 'react';
import { createElement, Fragment } from 'react';
import type { Message, MessageCatalog, ParamValue, PluralMessage } from './catalog/types.ts';
import type { Locale } from './locale.ts';
import { LOCALE_TAGS } from './locale.ts';

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;
const COUNT_PARAMETER = 'count';

export type TextParameters = Readonly<Record<string, ParamValue>>;
export type RichParameters = Readonly<Record<string, ReactNode>>;

export interface Translator {
  text(key: string, params?: TextParameters): string;
  rich(key: string, params: RichParameters): ReactNode;
  has(key: string): boolean;
}

function isPlural(message: Message): message is PluralMessage {
  return typeof message !== 'string';
}

function selectForm(message: PluralMessage, count: number, rules: Intl.PluralRules): string {
  if (count === 0 && message.none !== undefined) return message.none;
  return message[rules.select(count)] ?? message.other;
}

/** Looks a message up in a catalog and fills its placeholders, choosing the plural form of the locale. */
export function createTranslator(locale: Locale, catalog: MessageCatalog): Translator {
  const tag = LOCALE_TAGS[locale];
  const rules = new Intl.PluralRules(tag);
  const numbers = new Intl.NumberFormat(tag);

  const template = (key: string, params: Readonly<Record<string, unknown>> | undefined): string => {
    const message = catalog[key];
    if (message === undefined) return key;
    if (!isPlural(message)) return message;
    const count = params?.[COUNT_PARAMETER];
    return selectForm(message, typeof count === 'number' ? count : 0, rules);
  };

  const printable = (value: unknown): string => (typeof value === 'number' ? numbers.format(value) : String(value));

  return {
    text: (key, params) =>
      template(key, params).replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
        const value = params?.[name];
        return value === undefined ? placeholder : printable(value);
      }),
    rich: (key, params) => {
      const parts = template(key, params).split(PLACEHOLDER_PATTERN);
      return createElement(
        Fragment,
        null,
        ...parts.map((part, index) => {
          if (index % 2 === 0) return part;
          const value = params[part];
          return createElement(Fragment, { key: `${part}-${index}` }, typeof value === 'number' ? numbers.format(value) : value);
        }),
      );
    },
    has: (key) => key in catalog,
  };
}
