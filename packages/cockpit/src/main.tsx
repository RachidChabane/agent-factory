import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './app/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { createCockpitServices } from './app/services.ts';
import { applyTheme, prefersLightScheme, resolveInitialTheme, safeLocalStorage } from './app/theme.ts';
import { createBrowserTransport } from './data/http-transport.ts';
import { systemClock } from './model/clock.ts';

const ROOT_ELEMENT_ID = 'root';

const theme = resolveInitialTheme(window.location.search, safeLocalStorage(), prefersLightScheme());
applyTheme(theme);
const services = createCockpitServices({ transport: createBrowserTransport(), clock: systemClock, mode: 'live' });
const container = document.getElementById(ROOT_ELEMENT_ID);
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <App services={services} theme={theme} />
    </StrictMode>,
  );
}
