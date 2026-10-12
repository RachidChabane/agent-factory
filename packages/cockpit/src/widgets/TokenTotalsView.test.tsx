import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TokenTotals } from '../contract/index.ts';
import { renderWidget } from '../test/harness.tsx';
import { TokenTotalsView } from './TokenTotalsView.tsx';

const TOTALS: TokenTotals = { input: 1_200, output: 3_400, cacheRead: 880_000, cacheCreation: 14_000, withoutCache: 4_600, withCache: 898_600 };

describe('TokenTotalsView', () => {
  it('always states whether a total includes the cache tokens', async () => {
    await renderWidget(<TokenTotalsView totals={TOTALS} />);
    expect(screen.getByText('898.6K tokens including cache')).toBeInTheDocument();
    expect(screen.getByText('4.6K tokens excluding cache')).toBeInTheDocument();
  });

  it('breaks the totals down with the cache wording on both of them', async () => {
    await renderWidget(<TokenTotalsView totals={TOTALS} layout="breakdown" />);
    expect(screen.getByText('Including cache').nextSibling).toHaveTextContent('898,600');
    expect(screen.getByText('Excluding cache').nextSibling).toHaveTextContent('4,600');
    expect(screen.getByText('Cache read').nextSibling).toHaveTextContent('880,000');
    expect(screen.getByText('Cache creation').nextSibling).toHaveTextContent('14,000');
    expect(screen.getByText(/adds the tokens read from and written to the prompt cache/)).toBeInTheDocument();
  });

  it('says it in French too', async () => {
    await renderWidget(<TokenTotalsView totals={TOTALS} />, { locale: 'fr' });
    expect(screen.getByText(/jetons, cache compris/)).toBeInTheDocument();
    expect(screen.getByText(/jetons, hors cache/)).toBeInTheDocument();
  });
});
