import type { ReactNode } from 'react';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { ViewErrorBoundary } from './ViewErrorBoundary.tsx';

const CHUNK_FAILURE = 'Failed to fetch dynamically imported module: http://127.0.0.1:7420/assets/ReleasesView-Zz9y8x7w.js';
const RENDER_FAILURE = 'Cannot read properties of undefined';
const TITLE = 'This view could not be displayed';
const RETRY = 'Try again';
const RELOAD = 'Reload the page';
const REPAIRED = 'view repaired';

function Broken({ message }: { readonly message: string }): never {
  throw new Error(message);
}

function Switchable({ message }: { readonly message: string }) {
  const [broken, setBroken] = useState(true);
  return broken ? (
    <>
      <button type="button" onClick={() => setBroken(false)}>
        repair
      </button>
      <Broken message={message} />
    </>
  ) : (
    <p>{REPAIRED}</p>
  );
}

function inLanguage(content: ReactNode, locale: 'en' | 'fr' = 'en') {
  return (
    <I18nProvider initialLocale={locale} timeZone="UTC" storage={null}>
      {content}
    </I18nProvider>
  );
}

describe('ViewErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows the error instead of a blank page and leaves the rest of the tree alone', () => {
    const report = vi.fn();
    render(
      inLanguage(
        <>
          <nav>menu</nav>
          <ViewErrorBoundary resetKey="/runs" report={report}>
            <Broken message={RENDER_FAILURE} />
          </ViewErrorBoundary>
        </>,
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(TITLE);
    expect(screen.getByRole('alert')).toHaveTextContent('The rest of the cockpit keeps working.');
    expect(screen.getByTestId('view-error-detail')).toHaveTextContent(RENDER_FAILURE);
    expect(screen.getByText('menu')).toBeInTheDocument();
    expect(report).toHaveBeenCalledOnce();
  });

  it('speaks the language of the page', () => {
    render(
      inLanguage(
        <ViewErrorBoundary resetKey="/runs" report={vi.fn()}>
          <Broken message={RENDER_FAILURE} />
        </ViewErrorBoundary>,
        'fr',
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Cette vue n’a pas pu s’afficher');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('renders the view again on retry', async () => {
    let healthy = false;
    function Flaky() {
      if (!healthy) throw new Error(RENDER_FAILURE);
      return <p>{REPAIRED}</p>;
    }
    render(
      inLanguage(
        <ViewErrorBoundary resetKey="/runs" report={vi.fn()}>
          <Flaky />
        </ViewErrorBoundary>,
      ),
    );
    healthy = true;
    await userEvent.click(screen.getByRole('button', { name: RETRY }));
    expect(screen.getByText(REPAIRED)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reloads the document, not the view, when a chunk could not be loaded', async () => {
    const reload = vi.fn();
    render(
      inLanguage(
        <ViewErrorBoundary resetKey="/releases" reload={reload} report={vi.fn()}>
          <Broken message={CHUNK_FAILURE} />
        </ViewErrorBoundary>,
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A new version of the cockpit may be available');
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: RELOAD }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('clears the error when the reset key changes', () => {
    const report = vi.fn();
    const { rerender } = render(
      inLanguage(
        <ViewErrorBoundary resetKey="/runs" report={report}>
          <Switchable message={RENDER_FAILURE} />
        </ViewErrorBoundary>,
      ),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(
      inLanguage(
        <ViewErrorBoundary resetKey="/issues" report={report}>
          <p>another view</p>
        </ViewErrorBoundary>,
      ),
    );
    expect(screen.getByText('another view')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
