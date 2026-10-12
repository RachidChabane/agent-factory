import type { ReactElement } from 'react';
import { render, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { CockpitProvider } from '../app/context.tsx';
import type { CockpitServices } from '../app/services.ts';
import { createCockpitServices } from '../app/services.ts';
import { SnapshotGate } from '../app/SnapshotGate.tsx';
import type { Theme } from '../app/theme.ts';
import { ThemeProvider } from '../app/ThemeProvider.tsx';
import type { CockpitSnapshot } from '../contract/index.ts';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import type { Locale } from '../i18n/locale.ts';
import { fixedClock } from '../model/clock.ts';
import { ToastProvider } from '../ui/components/Toast.tsx';
import { FakeTransport } from './fake-transport.ts';
import { emptySnapshot } from './minimal-snapshot.ts';

export const TEST_NOW = Date.parse('2026-10-12T10:00:00.000Z');
export const TEST_TIME_ZONE = 'UTC';
const DEFAULT_PATH = '/';
const LOCATION_PROBE_ID = 'location-probe';

export interface RenderOptions {
  /** The address the router starts at. */
  readonly path?: string | undefined;
  readonly snapshot?: CockpitSnapshot | undefined;
  readonly locale?: Locale | undefined;
  readonly theme?: Theme | undefined;
  /** The storage the language is saved in; none by default, so that tests do not share a language. */
  readonly storage?: Storage | null | undefined;
}

export interface RenderedView extends RenderResult {
  readonly transport: FakeTransport;
  readonly services: CockpitServices;
  readonly user: ReturnType<typeof userEvent.setup>;
  /** The address the router is at, as `/path?query`. */
  location(): string;
  /** Resolves once the snapshot is loaded and drawn (lazy views still need `findBy` queries). */
  ready(): Promise<void>;
  /** Waits until the router is at this address (navigation is applied in a transition, not synchronously). */
  expectLocation(address: string): Promise<void>;
}

export interface HarnessOptions extends RenderOptions {
  readonly snapshot: CockpitSnapshot;
  /** Run log pages the transport serves, by run id. */
  readonly runLogs?: ReadonlyMap<string, unknown> | undefined;
  /** Pull request diffs the transport serves, by `diffKey(project, number)`. */
  readonly diffs?: ReadonlyMap<string, unknown> | undefined;
  /** Adjusts the transport before the cockpit starts, for example to make the first load fail. */
  readonly configureTransport?: ((transport: FakeTransport) => void) | undefined;
}

function LocationProbe() {
  const location = useLocation();
  return <output id={LOCATION_PROBE_ID} hidden>{`${location.pathname}${location.search}`}</output>;
}

export function createTestServices(
  snapshot: CockpitSnapshot,
  runLogs: ReadonlyMap<string, unknown> = new Map(),
  diffs: ReadonlyMap<string, unknown> = new Map(),
): { readonly services: CockpitServices; readonly transport: FakeTransport } {
  const transport = new FakeTransport(snapshot, snapshot.sequence);
  for (const [runId, page] of runLogs) transport.runLogs.set(runId, page);
  for (const [key, diff] of diffs) transport.diffs.set(key, diff);
  const services = createCockpitServices({ transport, clock: fixedClock(TEST_NOW), random: () => 0.5 });
  return { services, transport };
}

function mount(tree: ReactElement, options: HarnessOptions): RenderedView {
  const { services, transport } = createTestServices(options.snapshot, options.runLogs, options.diffs);
  options.configureTransport?.(transport);
  const result = render(
    <ThemeProvider initial={options.theme ?? 'dark'}>
      <I18nProvider initialLocale={options.locale ?? 'en'} timeZone={TEST_TIME_ZONE} storage={options.storage ?? null}>
        <ToastProvider>
          <CockpitProvider services={services}>
            <MemoryRouter initialEntries={[options.path ?? DEFAULT_PATH]}>
              <LocationProbe />
              {tree}
            </MemoryRouter>
          </CockpitProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  return {
    ...result,
    transport,
    services,
    user: userEvent.setup(),
    location: () => document.getElementById(LOCATION_PROBE_ID)?.textContent ?? '',
    ready: () =>
      waitFor(() => {
        if (services.store.getState().snapshot === null) throw new Error('the snapshot is not loaded yet');
      }),
    expectLocation: (address) => waitFor(() => expect(document.getElementById(LOCATION_PROBE_ID)?.textContent ?? '').toBe(address)),
  };
}

/** Like `renderInProviders`, without waiting for the snapshot: for the states before it is loaded. */
export function renderUnloaded(tree: ReactElement, options: HarnessOptions): RenderedView {
  return mount(tree, options);
}

/**
 * Renders a tree inside every provider of the cockpit and a memory router, over the given snapshot,
 * and resolves once the snapshot is loaded and drawn.
 */
export async function renderInProviders(tree: ReactElement, options: HarnessOptions): Promise<RenderedView> {
  const view = mount(tree, options);
  await view.ready();
  return view;
}

/** A widget alone over a snapshot that holds nothing but the installation. */
export function renderWidget(element: ReactElement, options: RenderOptions = {}): Promise<RenderedView> {
  return renderInProviders(
    <SnapshotGate>
      <Routes>
        <Route path="*" element={element} />
      </Routes>
    </SnapshotGate>,
    { ...options, snapshot: options.snapshot ?? emptySnapshot(TEST_NOW) },
  );
}
