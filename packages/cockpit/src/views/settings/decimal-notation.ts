import type { Locale } from '../../i18n/locale.ts';
import { LOCALE_TAGS } from '../../i18n/locale.ts';

const MAX_FRACTION_DIGITS = 20;
const DECIMAL_PROBE = 1.1;
const DECIMAL_POINT = '.';
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

/**
 * How a number is written in a field: digits with the decimal mark of the active language and no
 * thousands separator, so that "1,000" is never read as 1.
 */
export interface DecimalNotation {
  /** The text a field shows for a value. */
  format(value: number): string;
  /** A number with an optional decimal part; null for anything else, so that a typo never reads as a number. */
  parse(text: string): number | null;
  /** A number whose value is whole: "3" and "3.0" are, "2.5" is not. */
  parseWhole(text: string): number | null;
}

export function decimalNotation(locale: Locale): DecimalNotation {
  const numbers = new Intl.NumberFormat(LOCALE_TAGS[locale], { useGrouping: false, maximumFractionDigits: MAX_FRACTION_DIGITS });
  const mark = numbers.formatToParts(DECIMAL_PROBE).find((part) => part.type === 'decimal')?.value ?? DECIMAL_POINT;
  const parse = (text: string): number | null => {
    const normalized = text.trim().replace(mark, DECIMAL_POINT);
    const value = PLAIN_DECIMAL.test(normalized) ? Number(normalized) : Number.NaN;
    return Number.isFinite(value) ? value : null;
  };
  return {
    format: (value) => numbers.format(value),
    parse,
    parseWhole: (text) => {
      const value = parse(text);
      return value !== null && Number.isInteger(value) ? value : null;
    },
  };
}
