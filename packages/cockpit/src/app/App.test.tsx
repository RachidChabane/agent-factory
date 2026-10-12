import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../model/clock.ts';
import { TEST_NOW } from '../test/harness.tsx';
import { fixtureRunLogs, fixtureSnapshot } from '../test/render.tsx';
import { App } from './App.tsx';
import { createCockpitServices } from './services.ts';
import { FakeTransport } from '../test/fake-transport.ts';

afterEach(() => {
  window.history.pushState({}, '', '/');
});

function mountApp(path: string, locale: 'en' | 'fr' = 'en') {
  window.history.pushState({}, '', path);
  const transport = new FakeTransport(fixtureSnapshot());
  for (const [runId, page] of fixtureRunLogs()) transport.runLogs.set(runId, page);
  const services = createCockpitServices({ transport, clock: fixedClock(TEST_NOW), random: () => 0.5 });
  return { ...render(<App services={services} theme="dark" locale={locale} />), transport };
}

describe('App', () => {
  it('draws the shell and the board at its address, in a browser router', async () => {
    mountApp('/board');
    expect(await screen.findByRole('region', { name: 'Implementation' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('draws the page of the address it was opened at', async () => {
    mountApp('/projects/storefront/releases/1.8.2');
    expect(await screen.findByRole('heading', { level: 1, name: '1.8.2' })).toBeInTheDocument();
  });

  it('starts in the language it is given', async () => {
    mountApp('/board', 'fr');
    expect(await screen.findByRole('region', { name: 'Implémentation' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('starts the cockpit services and stops them when it goes away', async () => {
    const { transport, unmount } = mountApp('/board');
    await screen.findByRole('region', { name: 'Implementation' });
    expect(transport.snapshotLoads).toBe(1);
    expect(transport.handlers).not.toBeNull();
    unmount();
    expect(transport.handlers).toBeNull();
  });

});
