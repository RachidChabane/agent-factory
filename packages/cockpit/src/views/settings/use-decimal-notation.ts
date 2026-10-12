import { useMemo } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { DecimalNotation } from './decimal-notation.ts';
import { decimalNotation } from './decimal-notation.ts';

/** How numbers are written in the fields, in the active language. */
export function useDecimalNotation(): DecimalNotation {
  const { locale } = useI18n();
  return useMemo(() => decimalNotation(locale), [locale]);
}
