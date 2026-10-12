import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Reading } from '../contract/index.ts';
import { MINUTE_MS } from '../i18n/formatters.ts';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import { OptionalReadingView } from './ReadingView.tsx';

const minutesAgo = (minutes: number) => new Date(TEST_NOW - minutes * MINUTE_MS).toISOString();
const NO_SOURCE = 'No source is configured';
const NOT_READ = 'Nothing has been read from the source yet';
const NO_ITEM = 'The source holds no item';

function show(reading: Reading<readonly string[]> | null) {
  return renderWidget(
    <OptionalReadingView reading={reading} kind="forge" absent={NO_SOURCE} notRead={NOT_READ} isEmpty={(items) => items.length === 0} empty={NO_ITEM}>
      {(items) => (
        <ul aria-label="items">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </OptionalReadingView>,
  );
}

describe('ReadingView', () => {
  it('says that no source is configured when there is no reading at all', async () => {
    await show(null);
    expect(await screen.findByText(NO_SOURCE)).toBeInTheDocument();
  });

  it('says that the source was never read', async () => {
    await show({ value: null, readAt: null, error: null });
    expect(await screen.findByText(NOT_READ)).toBeInTheDocument();
  });

  it('says that the read failed when nothing was kept, and why', async () => {
    await show({ value: null, readAt: null, error: 'forge unreachable' });
    expect(await screen.findByText('Could not be read')).toBeInTheDocument();
    expect(screen.getByText('forge unreachable')).toBeInTheDocument();
  });

  it('says that a source read successfully holds nothing', async () => {
    await show({ value: [], readAt: minutesAgo(2), error: null });
    expect(await screen.findByText(NO_ITEM)).toBeInTheDocument();
    expect(screen.getByText(/^Read 2 min/)).toBeInTheDocument();
  });

  it('shows the value with the time it was read', async () => {
    await show({ value: ['alpha', 'beta'], readAt: minutesAgo(2), error: null });
    const list = await screen.findByRole('list', { name: 'items' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['alpha', 'beta']);
    expect(screen.getByText(/^Read 2 min/)).toBeInTheDocument();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });

  it('keeps showing the previous value, marked stale, with the error of the failed read', async () => {
    await show({ value: ['alpha'], readAt: minutesAgo(40), error: 'rate limit exceeded' });
    expect(await screen.findByRole('list', { name: 'items' })).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText(/The last read failed \(rate limit exceeded\)/)).toBeInTheDocument();
  });
});
