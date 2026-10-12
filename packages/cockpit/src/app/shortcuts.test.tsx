import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.tsx';

describe('go-to shortcuts', () => {
  it('goes to a page of the installation with g then a letter', async () => {
    const view = await renderApp('/');
    await view.user.keyboard('gu');
    await view.expectLocation('/usage');
    await view.user.keyboard('gb');
    await view.expectLocation('/');
    await view.user.keyboard('gr');
    await view.expectLocation('/runs');
  });

  it('goes to a page of the project in view', async () => {
    const view = await renderApp('/projects/ledger');
    await view.user.keyboard('gi');
    await view.expectLocation('/projects/ledger/issues');
    await view.user.keyboard('gp');
    await view.expectLocation('/projects/ledger/pull-requests');
    await view.user.keyboard('gd');
    await view.expectLocation('/projects/ledger/delivery');
  });

  it('keeps the project of the board filter when it goes to the runs', async () => {
    const view = await renderApp('/?project=ledger');
    await view.user.keyboard('gr');
    await view.expectLocation('/runs?project=ledger');
  });

  it('does nothing for a project page when no project is in view', async () => {
    const view = await renderApp('/');
    await view.user.keyboard('gi');
    expect(view.location()).toBe('/');
  });

  it('does not steal the keys typed in a field', async () => {
    const view = await renderApp('/');
    await view.user.click(await screen.findByPlaceholderText(/Filter by title/));
    await view.user.keyboard('gu');
    expect(view.location()).toBe('/');
    expect(screen.getByPlaceholderText(/Filter by title/)).toHaveValue('gu');
  });
});
