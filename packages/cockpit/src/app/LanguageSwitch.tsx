import { useI18n } from '../i18n/I18nProvider.tsx';
import { LOCALE_CODES, LOCALE_NAMES, LOCALES } from '../i18n/locale.ts';
import { Segmented } from '../ui/components/Tabs.tsx';

/** Switches the language of the cockpit; each language is named in itself so it can always be found. */
export function LanguageSwitch() {
  const { t, locale, setLocale } = useI18n();
  return (
    <Segmented
      size="sm"
      label={t('language.label')}
      value={locale}
      onChange={setLocale}
      items={LOCALES.map((entry) => ({ id: entry, label: LOCALE_CODES[entry], accessibleLabel: LOCALE_NAMES[entry] }))}
    />
  );
}
