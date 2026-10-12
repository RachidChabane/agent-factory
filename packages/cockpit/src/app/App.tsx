import { BrowserRouter } from 'react-router';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import type { Locale } from '../i18n/locale.ts';
import { ToastProvider } from '../ui/components/Toast.tsx';
import { AppRoutes } from './AppRoutes.tsx';
import { CockpitProvider } from './context.tsx';
import type { CockpitServices } from './services.ts';
import { Shell } from './Shell.tsx';
import type { Theme } from './theme.ts';
import { ThemeProvider } from './ThemeProvider.tsx';

interface AppProps {
  readonly services: CockpitServices;
  readonly theme: Theme;
  readonly locale: Locale;
}

export function App({ services, theme, locale }: AppProps) {
  return (
    <ThemeProvider initial={theme}>
      <I18nProvider initialLocale={locale}>
        <ToastProvider>
          <CockpitProvider services={services}>
            <BrowserRouter>
              <Shell>
                <AppRoutes />
              </Shell>
            </BrowserRouter>
          </CockpitProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
