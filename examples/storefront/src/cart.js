import { findProduct } from './catalog.js';

export class UnknownProductError extends Error {
  constructor(sku) {
    super(`unknown product ${sku}`);
    this.name = 'UnknownProductError';
  }
}

export function emptyCart() {
  return { lines: [] };
}

export function addItem(cart, sku, quantity) {
  if (findProduct(sku) === null) throw new UnknownProductError(sku);
  const existing = cart.lines.find((line) => line.sku === sku);
  const lines = existing === undefined
    ? [...cart.lines, { sku, quantity }]
    : cart.lines.map((line) => (line.sku === sku ? { sku, quantity: line.quantity + quantity } : line));
  return { lines };
}

export function removeItem(cart, sku) {
  return { lines: cart.lines.filter((line) => line.sku !== sku) };
}

export function subtotalCents(cart) {
  return cart.lines.reduce((sum, line) => sum + (findProduct(line.sku)?.priceCents ?? 0) * line.quantity, 0);
}

export function itemCount(cart) {
  return cart.lines.reduce((count, line) => count + line.quantity, 0);
}
