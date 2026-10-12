import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { AppRoutes } from '../app/AppRoutes.tsx';
import { Shell } from '../app/Shell.tsx';
import { SnapshotGate } from '../app/SnapshotGate.tsx';
import type { CockpitSnapshot } from '../contract/index.ts';
import type { RenderedView, RenderOptions } from './harness.tsx';
import { renderInProviders, TEST_NOW } from './harness.tsx';
import { buildWorld } from './fixtures/world.ts';

export { renderWidget, TEST_NOW, TEST_TIME_ZONE } from './harness.tsx';
export type { RenderedView, RenderOptions } from './harness.tsx';

const DEFAULT_PATH = '/';

export function fixtureSnapshot(): CockpitSnapshot {
  return buildWorld(TEST_NOW).snapshot;
}

export function fixtureRunLogs(): ReadonlyMap<string, unknown> {
  const logs = buildWorld(TEST_NOW).logs;
  return new Map([...logs.entries()].map(([runId, lines]) => [runId, { runId, total: lines.length, lines }]));
}

export function fixtureDiffs(): ReadonlyMap<string, unknown> {
  return buildWorld(TEST_NOW).diffs;
}

function withWorld(path: string, options: Omit<RenderOptions, 'path'>) {
  return { ...options, path, snapshot: options.snapshot ?? fixtureSnapshot(), runLogs: fixtureRunLogs(), diffs: fixtureDiffs() };
}

/** A component alone, in the providers and a router, over the fixture world once the snapshot is loaded. */
export function renderWithCockpit(element: ReactElement, options: RenderOptions = {}): Promise<RenderedView> {
  return renderInProviders(
    <SnapshotGate>
      <Routes>
        <Route path="*" element={element} />
      </Routes>
    </SnapshotGate>,
    withWorld(options.path ?? DEFAULT_PATH, options),
  );
}

/** The routes of the cockpit at an address, without the shell around them. */
export function renderRoute(path: string, options: Omit<RenderOptions, 'path'> = {}): Promise<RenderedView> {
  return renderInProviders(
    <SnapshotGate>
      <AppRoutes />
    </SnapshotGate>,
    withWorld(path, options),
  );
}

/** The whole application at an address: the shell and the routes. */
export function renderApp(path = DEFAULT_PATH, options: Omit<RenderOptions, 'path'> = {}): Promise<RenderedView> {
  return renderInProviders(
    <Shell>
      <AppRoutes />
    </Shell>,
    withWorld(path, options),
  );
}
