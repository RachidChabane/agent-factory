import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.tsx';

const sidebar = () => screen.getByRole('navigation');

async function openSwitcher(path: string, options: Parameters<typeof renderApp>[1] = {}) {
  const view = await renderApp(path, options);
  await view.user.click(within(sidebar()).getByRole('button', { name: /^Project:|^Projet\s:/ }));
  return { view, list: await screen.findByRole('dialog', { name: options.locale === 'fr' ? 'Choisir un projet' : 'Choose a project' }) };
}

describe('ProjectSwitcher', () => {
  it('shows all projects at first, with the projects listed under it', async () => {
    await renderApp('/');
    expect(within(sidebar()).getByRole('button', { name: 'Project: All projects' })).toHaveTextContent('2 projects');
    const projects = within(sidebar()).getByText('Projects').closest('div');
    expect(within(projects as HTMLElement).getByRole('link', { name: /Storefront/ })).toHaveAttribute('href', '/projects/storefront');
    expect(within(projects as HTMLElement).getByRole('link', { name: /Ledger/ })).toHaveAttribute('href', '/projects/ledger');
    expect(within(sidebar()).queryByRole('link', { name: 'Issues' })).not.toBeInTheDocument();
  });

  it('lists every project with a short status summary', async () => {
    const { list } = await openSwitcher('/');
    const options = within(list).getAllByRole('link');
    expect(options.map((option) => option.getAttribute('href'))).toEqual(['/', '/projects/storefront', '/projects/ledger']);
    expect(options[0]).toHaveTextContent('All projects');
    expect(options[0]).toHaveAttribute('aria-current', 'true');
    expect(options[1]).toHaveTextContent('Storefront');
    expect(options[1]).toHaveTextContent('10 need you · 2 runs live');
    expect(options[2]).toHaveTextContent('Ledger');
    expect(options[2]).toHaveTextContent('5 need you · Paused');
  });

  it('opens the overview of the chosen project and shows its pages in the sidebar', async () => {
    const { view, list } = await openSwitcher('/');
    await view.user.click(within(list).getByRole('link', { name: /Storefront/ }));
    await view.expectLocation('/projects/storefront');
    expect(within(sidebar()).getByRole('button', { name: 'Project: Storefront' })).toHaveTextContent('10 need you · 2 runs live');
    for (const page of ['Overview', 'Requests', 'Issues', 'Pull requests', 'Delivery', 'Releases', 'Audits', 'Knowledge', 'Project settings']) {
      expect(within(sidebar()).getByRole('link', { name: new RegExp(`^${page}`) })).toBeInTheDocument();
    }
    expect(within(sidebar()).queryByText('Projects')).not.toBeInTheDocument();
  });

  it('keeps the section when the project changes on a project page', async () => {
    const { view, list } = await openSwitcher('/projects/storefront/issues/45');
    await view.user.click(within(list).getByRole('link', { name: /Ledger/ }));
    await view.expectLocation('/projects/ledger/issues');
  });

  it('keeps the run list when the project changes there, and leaves the filter with all projects', async () => {
    const { view, list } = await openSwitcher('/runs');
    await view.user.click(within(list).getByRole('link', { name: /Ledger/ }));
    await view.expectLocation('/runs?project=ledger');
    await view.user.click(within(sidebar()).getByRole('button', { name: 'Project: Ledger' }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Choose a project' })).getByRole('link', { name: /All projects/ }));
    await view.expectLocation('/runs');
  });

  it('goes back to the board of all projects from a project page', async () => {
    const { view, list } = await openSwitcher('/projects/ledger/audits');
    await view.user.click(within(list).getByRole('link', { name: /All projects/ }));
    await view.expectLocation('/');
  });

  it('follows the project named in the address of the board and carries it to the pages of the workspace', async () => {
    await renderApp('/?project=ledger');
    expect(within(sidebar()).getByRole('button', { name: 'Project: Ledger' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: /^Board/ })).toHaveAttribute('href', '/?project=ledger');
    expect(within(sidebar()).getByRole('link', { name: /^Runs/ })).toHaveAttribute('href', '/runs?project=ledger');
  });

  it('selects nothing for a project the installation does not know', async () => {
    await renderApp('/?project=nowhere');
    expect(within(sidebar()).getByRole('button', { name: 'Project: All projects' })).toBeInTheDocument();
  });

  it('counts, next to each page of a project, what waits for the operator', async () => {
    await renderApp('/projects/storefront');
    const count = (page: string) => within(within(sidebar()).getByRole('link', { name: new RegExp(`^${page}`) })).queryByLabelText(/items?$/)?.textContent;
    expect(count('Requests')).toBe('3');
    expect(count('Pull requests')).toBe('3');
    expect(count('Audits')).toBe('1');
    expect(count('Releases')).toBe('2');
    expect(count('Runs')).toBe('2');
    expect(count('Board')).toBe('10');
    expect(count('Issues')).toBeUndefined();
  });

  it('opens the switcher and lists the projects in French', async () => {
    const { list } = await openSwitcher('/', { locale: 'fr' });
    expect(within(list).getByRole('link', { name: /Tous les projets/ })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /Storefront/ })).toHaveTextContent('10 vous concernent · 2 runs en direct');
    expect(within(list).getByRole('link', { name: /Ledger/ })).toHaveTextContent('5 vous concernent · En pause');
  });
});
