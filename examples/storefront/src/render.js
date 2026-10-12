import { CATALOG } from './catalog.js';
import { itemCount, subtotalCents } from './cart.js';
import { formatCents } from './pricing.js';

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function productRow(product) {
  return `<li data-sku="${product.sku}"><span>${escapeHtml(product.name)}</span> <strong>${formatCents(product.priceCents)}</strong></li>`;
}

export function renderPage(cart) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Storefront</title></head>',
    '<body>',
    `<header><h1>Storefront</h1><p class="cart-summary">${itemCount(cart)} items, ${formatCents(subtotalCents(cart))}</p></header>`,
    `<main><ul class="catalog">${CATALOG.map(productRow).join('')}</ul></main>`,
    '</body>',
    '</html>',
  ].join('\n');
}
