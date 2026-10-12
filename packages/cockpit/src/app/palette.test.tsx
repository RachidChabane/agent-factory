import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectCommand } from '../test/commands.ts';
import { withInstallation } from '../test/fixtures/mutate.ts';
import { fixtureSnapshot, renderApp } from '../test/render.tsx';

async function openPalette(path = '/', options: Parameters<typeof renderApp>[1] = {}) {
  const view = await renderApp(path, options);
  await view.user.keyboard('{Control>}k{/Control}');
  const palette = await screen.findByRole('dialog', { name: options.locale === 'fr' ? 'Palette de commandes' : 'Command palette' });
  return { view, palette, input: within(palette).getByRole('combobox') };
}

async function pick(query: string, path = '/') {
  const opened = await openPalette(path);
  await opened.view.user.type(opened.input, query);
  return opened;
}

describe('command palette navigation', () => {
  it('opens with Control K, focuses the search field and closes with Escape', async () => {
    const { view, input, palette } = await openPalette();
    expect(input).toHaveFocus();
    await view.user.keyboard('{Escape}');
    expect(palette).not.toBeVisible();
  });

  it('goes to a page of the installation with the keyboard', async () => {
    const { view, palette } = await pick('usage');
    const options = within(palette).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Go to Usage and costs');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await view.user.keyboard('{Enter}');
    await view.expectLocation('/usage');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('goes to any page of any project', async () => {
    const { view } = await pick('ledger delivery');
    await view.user.keyboard('{Enter}');
    await view.expectLocation('/projects/ledger/delivery');
  });

  it('opens a project', async () => {
    const { view, palette } = await pick('open project storefront');
    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('Open project Storefront');
    await view.user.keyboard('{Enter}');
    await view.expectLocation('/projects/storefront');
  });

  it('moves through the results with the arrow keys', async () => {
    const { view, palette } = await pick('settings');
    const options = within(palette).getAllByRole('option');
    expect(options.length).toBeGreaterThan(2);
    await view.user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await view.user.keyboard('{ArrowUp}');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('says when nothing matches', async () => {
    const { palette } = await pick('zzzzzz');
    expect(within(palette).getByText('No result for “zzzzzz”')).toBeInTheDocument();
  });

  it('offers a page for every project and every section', async () => {
    const { palette } = await openPalette();
    const labels = within(palette).getAllByRole('option').map((option) => option.textContent ?? '');
    expect(labels.some((label) => label.includes('Go to Board'))).toBe(true);
    expect(labels.some((label) => label.includes('Go to Runs'))).toBe(true);
    expect(labels.some((label) => label.includes('Go to Settings'))).toBe(true);
  });

  it('starts a new request in a project by opening its dialog', async () => {
    const { view } = await pick('new request ledger');
    await view.user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'New request' })).toBeInTheDocument();
    await view.expectLocation('/projects/ledger/requests');
  });
});

describe('command palette commands', () => {
  it('refreshes the subscription usage', async () => {
    const { view } = await pick('refresh subscription');
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'usage.refresh', {});
  });

  it('pauses the whole factory', async () => {
    const { view } = await pick('pause the factory');
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'scheduler.pause', { project: null });
  });

  it('asks for confirmation, then stops the factory once its running work finishes', async () => {
    const { view } = await pick('stop after running work');
    await view.user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Stop the factory once its running work finishes?' });
    expect(view.transport.commands).toEqual([]);
    await view.user.click(within(dialog).getByRole('button', { name: 'Stop after running work' }));
    await expectCommand(view.transport, 'factory.drain', {});
  });

  it('sends nothing when the confirmation of the drain is cancelled', async () => {
    const { view } = await pick('stop after running work');
    await view.user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Stop the factory once its running work finishes?' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
  });

  it('does not offer the drain in the demonstration', async () => {
    const opened = await openPalette('/', { snapshot: withInstallation(fixtureSnapshot(), { mode: 'demo' }) });
    await opened.view.user.type(opened.input, 'stop after running work');
    expect(within(opened.palette).queryAllByRole('option')).toEqual([]);
  });

  it('pauses a project, or resumes the project the operator paused', async () => {
    const pause = await pick('pause storefront');
    await pause.view.user.keyboard('{Enter}');
    await expectCommand(pause.view.transport, 'scheduler.pause', { project: 'storefront' });
    pause.view.unmount();
    const resume = await pick('resume ledger');
    await resume.view.user.keyboard('{Enter}');
    await expectCommand(resume.view.transport, 'scheduler.resume', { project: 'ledger' });
  });

  it('validates the spec of an issue', async () => {
    const { view, palette } = await pick('validate the spec of #75');
    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('Storefront · Pin the HTTP client timeout');
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'issue.validate-spec', { project: 'storefront', issueNumber: 75 });
  });

  it('leads to the confirmation of the merge of a pull request that waits for the operator', async () => {
    const { view, palette } = await pick('merge pr #57');
    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('Merge PR #57');
    await view.user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Merge #57?' })).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('offers no merge for a pull request that is not ready to merge', async () => {
    const { palette } = await pick('merge pr #60');
    expect(within(palette).queryAllByRole('option').filter((option) => option.textContent?.includes('Merge PR #60'))).toEqual([]);
  });

  it('starts a queued issue of the right project', async () => {
    const ledger = await pick('start #29');
    await ledger.view.user.keyboard('{Enter}');
    await expectCommand(ledger.view.transport, 'issue.start', { project: 'ledger', issueNumber: 29 });
    ledger.view.unmount();
    const storefront = await pick('start #77');
    await storefront.view.user.keyboard('{Enter}');
    await expectCommand(storefront.view.transport, 'issue.start', { project: 'storefront', issueNumber: 77 });
  });

  it('does not offer to start an issue that is blocked, or to validate a spec that is validated', async () => {
    const { palette, view } = await pick('start #70');
    expect(within(palette).queryAllByRole('option').filter((option) => option.textContent?.includes('Start #70'))).toEqual([]);
    await view.user.clear(within(palette).getByRole('combobox'));
    await view.user.type(within(palette).getByRole('combobox'), 'validate the spec of #77');
    expect(within(palette).queryAllByRole('option').filter((option) => option.textContent?.includes('Validate the spec of #77'))).toEqual([]);
  });

  it('starts the challenge of a request, choosing the project by its title', async () => {
    const { view } = await pick('start the challenge guest checkout');
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'request.challenge', { project: 'storefront', requestId: 'R-13' });
  });

  it('cuts and evaluates releases', async () => {
    const cut = await pick('cut release pr-72');
    await cut.view.user.keyboard('{Enter}');
    await expectCommand(cut.view.transport, 'release.cut', { project: 'storefront', releaseId: 'pr-72' });
    cut.view.unmount();
    const evaluate = await pick('evaluate release 1.8.2');
    await evaluate.view.user.keyboard('{Enter}');
    await expectCommand(evaluate.view.transport, 'release.evaluate', { project: 'storefront', releaseId: '1.8.2' });
  });

  it('never offers to cut a release another version has overtaken', async () => {
    const { palette } = await pick('release pr-47');
    expect(within(palette).queryAllByRole('option').filter((option) => /Cut release pr-47|Evaluate release pr-47/.test(option.textContent ?? ''))).toEqual([]);
  });

  it('publishes the issue of an audit that has a draft', async () => {
    const { view } = await pick('publish the issue of audit 1d52ca9');
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'audit.publish-issue', { project: 'storefront', auditId: '1d52ca9c01c0f9ada07c0141457c9bd57f8e06ca' });
  });

  it('checks the health of an environment of the chosen project', async () => {
    const { view, palette } = await pick('check the health of staging ledger');
    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('Ledger');
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'health.check', { project: 'ledger', environment: 'staging' });
  });

  it('shows what the factory did, and what it refused', async () => {
    const accepted = await pick('refresh subscription');
    accepted.view.transport.effects.set('usage.refresh', 'Usage read for 1 account');
    await accepted.view.user.keyboard('{Enter}');
    expect(await within(screen.getByRole('status')).findByText('Usage read for 1 account')).toBeInTheDocument();
    accepted.view.unmount();
    const refused = await pick('refresh subscription');
    refused.view.transport.commandFailure = 'no account is configured';
    await refused.view.user.keyboard('{Enter}');
    expect(await within(screen.getByRole('alert')).findByText('no account is configured')).toBeInTheDocument();
  });
});

describe('command palette in French', () => {
  it('searches and names pages in French', async () => {
    const { view, palette, input } = await openPalette('/', { locale: 'fr' });
    await view.user.type(input, 'usage');
    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('Aller à Usage et coûts');
    await view.user.keyboard('{Enter}');
    await view.expectLocation('/usage');
  });

  it('names the commands in French', async () => {
    const { view, palette, input } = await openPalette('/', { locale: 'fr' });
    await view.user.type(input, 'valider la spec de #75');
    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('Valider la spec de #75');
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'issue.validate-spec', { project: 'storefront', issueNumber: 75 });
  });
});
