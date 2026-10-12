const CENTS_PER_DOLLAR = 100;
const LINE_PRICE_CENTS = 1999;

export interface BasketLine {
  readonly name: string;
  readonly cents: number;
}

/** The basket every scenario of the demonstration checks out: three lines at the same price. */
export const BASKET: readonly BasketLine[] = ['Linen tote bag', 'Ceramic mug', 'Notebook set'].map((name) => ({ name, cents: LINE_PRICE_CENTS }));

export function dollars(cents: number): string {
  return `$${(cents / CENTS_PER_DOLLAR).toFixed(2)}`;
}

export const BASKET_TOTAL_CENTS = BASKET.reduce((total, line) => total + line.cents, 0);
export const BASKET_SUMMARY = `${BASKET.length} items, ${dollars(BASKET_TOTAL_CENTS)}`;
