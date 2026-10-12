import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUnloaded, TEST_NOW } from '../test/harness.tsx';
import { emptySnapshot } from '../test/minimal-snapshot.ts';
import { AppRoutes } from './AppRoutes.tsx';
import { Shell } from './Shell.tsx';

describe('Shell before the factory answers', () => {
  it('shows a skeleton and a connection state while the first snapshot loads', () => {
    renderUnloaded(
      <Shell>
        <AppRoutes />
      </Shell>,
      { snapshot: emptySnapshot(TEST_NOW) },
    );
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByLabelText('Loading the page')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('says why the factory cannot be reached when the first snapshot never arrives', async () => {
    renderUnloaded(
      <Shell>
        <AppRoutes />
      </Shell>,
      {
        snapshot: emptySnapshot(TEST_NOW),
        configureTransport: (transport) => {
          transport.failSnapshot = true;
        },
      },
    );
    expect(await screen.findByText('The factory cannot be reached')).toBeInTheDocument();
    expect(screen.getByText('The cockpit retries by itself. Last error: connection refused')).toBeInTheDocument();
    expect(screen.getByText(/the factory server cannot be reached/)).toBeInTheDocument();
  });
});
