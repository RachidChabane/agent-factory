import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './widgets/widgets.css';
import './app/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { createCockpitServices } from './app/services.ts';
import { applyTheme, prefersLightScheme, resolveInitialTheme } from './app/theme.ts';
import { createBrowserTransport } from './data/http-transport.ts';
import { resolveInitialLocale } from './i18n/locale.ts';
import { systemClock } from './model/clock.ts';
import { safeLocalStorage } from './platform/storage.ts';

const ROOT_ELEMENT_ID = 'root';

const storage = safeLocalStorage();
const theme = resolveInitialTheme(window.location.search, storage, prefersLightScheme());
const locale = resolveInitialLocale(window.location.search, storage);
applyTheme(theme);
document.documentElement.lang = locale;
const services = createCockpitServices({ transport: createBrowserTransport(), clock: systemClock });
const container = document.getElementById(ROOT_ELEMENT_ID);
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <App services={services} theme={theme} locale={locale} />
    </StrictMode>,
  );
}
