import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { CockpitProvider } from '../app/context.tsx';
import type { CockpitServices } from '../app/services.ts';
import { createCockpitServices } from '../app/services.ts';
import { ThemeProvider } from '../app/ThemeProvider.tsx';
import type { CockpitSnapshot } from '../contract/index.ts';
import { fixedClock } from '../model/clock.ts';
import { ToastProvider } from '../ui/components/Toast.tsx';
import { FakeTransport } from './fake-transport.ts';
import { buildWorld } from './fixtures/world.ts';

export const TEST_NOW = Date.parse('2026-10-10T09:30:00.000Z');

export function fixtureSnapshot(): CockpitSnapshot {
  return buildWorld(TEST_NOW).snapshot;
}

export function fixtureRunLogs(): ReadonlyMap<string, unknown> {
  const logs = buildWorld(TEST_NOW).logs;
  return new Map([...logs.entries()].map(([runId, lines]) => [runId, { runId, total: lines.length, lines }]));
}

export interface RenderOptions {
  readonly path?: string | undefined;
  readonly route?: string | undefined;
  readonly snapshot?: CockpitSnapshot | undefined;
}

export interface RenderedView extends RenderResult {
  readonly transport: FakeTransport;
  readonly services: CockpitServices;
}

export function createTestServices(snapshot: CockpitSnapshot): { readonly services: CockpitServices; readonly transport: FakeTransport } {
  const transport = new FakeTransport(snapshot, snapshot.sequence);
  for (const [runId, page] of fixtureRunLogs()) transport.runLogs.set(runId, page);
  const services = createCockpitServices({ transport, clock: fixedClock(TEST_NOW), mode: 'mock', random: () => 0.5 });
  return { services, transport };
}

export function renderWithCockpit(element: ReactElement, options: RenderOptions = {}): RenderedView {
  const { services, transport } = createTestServices(options.snapshot ?? fixtureSnapshot());
  const path = options.path ?? '/';
  const result = render(
    <ThemeProvider initial="dark">
      <ToastProvider>
        <CockpitProvider services={services}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={options.route ?? '*'} element={element} />
            </Routes>
          </MemoryRouter>
        </CockpitProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
  return { ...result, transport, services };
}

export async function waitForSnapshot(text: string | RegExp): Promise<HTMLElement> {
  return screen.findByText(text, undefined, { timeout: 2000 });
}
