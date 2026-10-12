const CENTS_PER_UNIT = 100;

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const units = Math.floor(absolute / CENTS_PER_UNIT);
  const rest = String(absolute % CENTS_PER_UNIT).padStart(2, '0');
  return `${sign}$${units}.${rest}`;
}
