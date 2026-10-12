import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWidget } from '../test/harness.tsx';
import { CostBasisNote, Money } from './Money.tsx';

describe('Money', () => {
  it('labels an amount of subscription usage as the API-equivalent price, not money spent', async () => {
    await renderWidget(<Money amount={12.4} basis="subscription-equivalent" />);
    expect(screen.getByText('$12.40')).toBeInTheDocument();
    const label = screen.getByText('API-equivalent');
    expect(label).toHaveAttribute('title', 'The API price of this subscription usage. It is not money spent: the subscription covers it.');
  });

  it('labels a metered amount and a mixed amount', async () => {
    await renderWidget(
      <>
        <Money amount={3} basis="metered" />
        <Money amount={7} basis="mixed" />
      </>,
    );
    expect(screen.getByText('Metered')).toHaveAttribute('title', 'Billed per token by the API.');
    expect(screen.getByText('Mixed')).toBeInTheDocument();
  });

  it('keeps tiny amounts visible and formats in the active language', async () => {
    await renderWidget(
      <>
        <Money amount={0.0042} basis="metered" />
        <Money amount={1234.5} basis="metered" />
      </>,
      { locale: 'fr' },
    );
    expect(screen.getByText('0,0042 $US')).toBeInTheDocument();
    expect(screen.getByText((content) => content.replace(/\s/g, ' ') === '1 234,50 $US')).toBeInTheDocument();
    expect(screen.getAllByText('Facturé')).toHaveLength(2);
  });
});

describe('CostBasisNote', () => {
  it('explains once what the dollar figures of a page mean', async () => {
    await renderWidget(<CostBasisNote basis="subscription-equivalent" />);
    expect(screen.getByRole('note')).toHaveTextContent('Dollar figures are API-equivalent prices');
    expect(screen.getByRole('note')).toHaveTextContent('it is not money spent');
  });

  it('has a sentence for each basis', async () => {
    await renderWidget(
      <>
        <CostBasisNote basis="metered" />
        <CostBasisNote basis="mixed" />
      </>,
    );
    expect(screen.getByText('Dollar figures are metered prices')).toBeInTheDocument();
    expect(screen.getByText('Dollar figures mix metered and API-equivalent prices')).toBeInTheDocument();
  });
});
