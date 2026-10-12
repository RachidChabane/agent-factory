const CENTS_PER_UNIT = 100;
const PERCENT_DIVISOR = 100;
const CENT_DIGITS = 2;
const CENT_PADDING = '0';

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const units = Math.floor(absolute / CENTS_PER_UNIT);
  const rest = String(absolute % CENTS_PER_UNIT).padStart(CENT_DIGITS, CENT_PADDING);
  return `${sign}$${units}.${rest}`;
}

export function percentOf(cents, percent) {
  return Math.round((cents * percent) / PERCENT_DIVISOR);
}
