import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.tsx';

const AUDIT = 'bfd32d775ee4a53d323db1e3a778b905cf3aa923';
const INTERACTIVE =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="combobox"], [role="menuitem"], [role="option"]';

const PAGES = [
  '/',
  '/projects/storefront',
  '/projects/storefront/requests/R-15',
  '/projects/storefront/issues',
  '/projects/storefront/issues/49',
  '/projects/storefront/pull-requests/57',
  '/projects/storefront/delivery',
  '/projects/storefront/releases/1.8.2',
  `/projects/storefront/audits/${AUDIT}`,
  '/projects/storefront/knowledge',
  '/projects/storefront/settings',
  '/projects/ledger',
  '/runs/run_7f3a2c',
  '/usage',
  '/settings',
] as const;

function textOf(ids: string | null): string {
  if (ids === null) return '';
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

/** The name a user of assistive technology would hear for an interactive element, as far as the markup gives one. */
function accessibleName(element: HTMLElement): string {
  const labelled = textOf(element.getAttribute('aria-labelledby'));
  if (labelled !== '') return labelled;
  const label = element.getAttribute('aria-label')?.trim() ?? '';
  if (label !== '') return label;
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const fromLabels = [...(element.labels ?? [])].map((entry) => entry.textContent ?? '').join(' ').trim();
    if (fromLabels !== '') return fromLabels;
  }
  const nested = [...element.querySelectorAll('[aria-label], img[alt]')].map((entry) => entry.getAttribute('aria-label') ?? entry.getAttribute('alt') ?? '').join(' ').trim();
  const text = (element.textContent ?? '').trim();
  return text !== '' ? text : nested !== '' ? nested : (element.getAttribute('title')?.trim() ?? '');
}

function describe_(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classes = element.getAttribute('class');
  return `<${tag}${classes === null ? '' : ` class="${classes}"`}> in ${element.closest('[aria-label], section, article, dialog')?.getAttribute('aria-label') ?? element.parentElement?.tagName.toLowerCase() ?? 'document'}`;
}

describe('the check of accessible names', () => {
  it('finds a control that has an icon and no name', () => {
    const button = document.createElement('button');
    button.innerHTML = '<svg aria-hidden="true"></svg>';
    expect(accessibleName(button)).toBe('');
  });

  it('accepts a name given by text, by aria-label, by title, by an image or by a label', () => {
    const withText = document.createElement('button');
    withText.textContent = 'Save';
    const withAria = document.createElement('button');
    withAria.setAttribute('aria-label', 'Close');
    const withTitle = document.createElement('button');
    withTitle.setAttribute('title', 'Copy');
    const withImage = document.createElement('a');
    withImage.innerHTML = '<svg role="img" aria-label="Agent working"></svg>';
    expect([withText, withAria, withTitle, withImage].map(accessibleName)).toEqual(['Save', 'Close', 'Copy', 'Agent working']);
    document.body.innerHTML = '<label for="q">Search</label><input id="q" />';
    const input = document.getElementById('q');
    expect(input instanceof HTMLElement && accessibleName(input)).toBe('Search');
    document.body.innerHTML = '';
  });
});

describe('the pages of the cockpit', () => {
  it.each(PAGES)('give a name to every control of %s', async (path) => {
    await renderApp(path);
    await screen.findAllByRole('heading', { level: 1 });
    const unnamed = [...document.body.querySelectorAll<HTMLElement>(INTERACTIVE)].filter((element) => accessibleName(element) === '').map(describe_);
    expect(unnamed).toEqual([]);
  });

  it('give a name to every control of the shell in French', async () => {
    await renderApp('/projects/storefront/issues', { locale: 'fr' });
    await screen.findAllByRole('heading', { level: 1 });
    const unnamed = [...document.body.querySelectorAll<HTMLElement>(INTERACTIVE)].filter((element) => accessibleName(element) === '').map(describe_);
    expect(unnamed).toEqual([]);
  });

  it('mark the page language and keep one main landmark', async () => {
    await renderApp('/');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });
});
