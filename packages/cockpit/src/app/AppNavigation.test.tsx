import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STOREFRONT_ID } from '../test/fixtures/project-ids.ts';
import { renderApp } from '../test/render.tsx';
import { paths } from '../model/routes.ts';

const NAVIGATION_ROUNDS = 2;
const VIEW_RENDER_TIMEOUT_MS = 8_000;
const MAIN_NAVIGATION = 'Main navigation';
const LOADING = 'Loading the page';

describe('navigating the menus', () => {
  it(
    'renders every view twice with a single snapshot fetch and a single stream',
    async () => {
      const view = await renderApp(paths.project(STOREFRONT_ID));
      const sidebar = screen.getByRole('navigation', { name: MAIN_NAVIGATION });
      const entries = within(sidebar).getAllByRole('link').map((link) => link.getAttribute('title') ?? link.textContent ?? '');
      expect(entries.length).toBeGreaterThanOrEqual(10);
      for (let round = 0; round < NAVIGATION_ROUNDS; round += 1) {
        for (const entry of entries) {
          await view.user.click(within(sidebar).getByTitle(entry));
          await waitFor(() => expect(screen.queryByLabelText(LOADING)).toBeNull(), { timeout: VIEW_RENDER_TIMEOUT_MS });
          expect(screen.queryAllByRole('alert').filter((alert) => (alert.textContent ?? '').trim() !== ''), `the view of "${entry}" shows an alert`).toEqual([]);
          expect(document.querySelector('main#content')?.textContent?.trim(), `the view of "${entry}" is empty`).not.toBe('');
        }
      }
      expect(view.transport.snapshotLoads).toBe(1);
      expect(view.transport.openedAfter).toHaveLength(1);
    },
    NAVIGATION_ROUNDS * 20 * VIEW_RENDER_TIMEOUT_MS,
  );
});
