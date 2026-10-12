import { BrowserRouter } from 'react-router';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import type { Locale } from '../i18n/locale.ts';
import { ToastProvider } from '../ui/components/Toast.tsx';
import { AppRoutes } from './AppRoutes.tsx';
import { CockpitProvider } from './context.tsx';
import type { CockpitServices } from './services.ts';
import { Shell } from './Shell.tsx';
import { ViewErrorBoundary } from './ViewErrorBoundary.tsx';
import type { Theme } from './theme.ts';
import { ThemeProvider } from './ThemeProvider.tsx';

/** The application boundary never resets: only a reload gets out of an error the shell itself raised. */
const APPLICATION_RESET_KEY = 'application';

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
            <ViewErrorBoundary resetKey={APPLICATION_RESET_KEY}>
              <BrowserRouter>
                <Shell>
                  <AppRoutes />
                </Shell>
              </BrowserRouter>
            </ViewErrorBoundary>
          </CockpitProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
