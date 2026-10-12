import type { StoryFile } from '../story-types.ts';

export const CART_BADGE_TOTAL_CHECK: StoryFile = {
  path: 'test/acceptance/cart-badge-total.test.js',
  content: `import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addItem, emptyCart } from '../../src/cart.js';
import { renderPage } from '../../src/render.js';

const labels = await import('../../src/labels.js').catch(() => ({}));

const BADGE_OPENING = '<span class="cart-badge">';
const BADGE_CLOSING = '</span>';
const HEADER_IMAGE = fileURLToPath(new URL('../../test-results/cart-badge.svg', import.meta.url));
const SHOP_NAME = 'Storefront';
const IMAGE_WIDTH = 480;
const IMAGE_HEIGHT = 96;
const TITLE_LEFT = 24;
const TITLE_BASELINE = 57;
const TITLE_FONT_SIZE = 26;
const BADGE_LEFT = 276;
const BADGE_TOP = 28;
const BADGE_WIDTH = 180;
const BADGE_HEIGHT = 40;
const BADGE_TEXT_BASELINE = 54;
const BADGE_FONT_SIZE = 18;

function badgeText(page) {
  const start = page.indexOf(BADGE_OPENING);
  if (start === -1) return null;
  const textStart = start + BADGE_OPENING.length;
  return page.slice(textStart, page.indexOf(BADGE_CLOSING, textStart));
}

function escapeXml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function badgeShapes(text) {
  if (text === null) return [];
  const centre = BADGE_LEFT + BADGE_WIDTH / 2;
  return [
    \`<rect x="\${BADGE_LEFT}" y="\${BADGE_TOP}" width="\${BADGE_WIDTH}" height="\${BADGE_HEIGHT}" rx="\${BADGE_HEIGHT / 2}" fill="#0969da"/>\`,
    \`<text x="\${centre}" y="\${BADGE_TEXT_BASELINE}" font-family="Helvetica, Arial, sans-serif" font-size="\${BADGE_FONT_SIZE}" fill="#ffffff" text-anchor="middle">\${escapeXml(text)}</text>\`,
  ];
}

function headerImage(badge) {
  return [
    \`<svg xmlns="http://www.w3.org/2000/svg" width="\${IMAGE_WIDTH}" height="\${IMAGE_HEIGHT}" viewBox="0 0 \${IMAGE_WIDTH} \${IMAGE_HEIGHT}">\`,
    \`<rect width="\${IMAGE_WIDTH}" height="\${IMAGE_HEIGHT}" fill="#f6f8fa"/>\`,
    \`<text x="\${TITLE_LEFT}" y="\${TITLE_BASELINE}" font-family="Helvetica, Arial, sans-serif" font-size="\${TITLE_FONT_SIZE}" font-weight="700" fill="#1f2328">\${SHOP_NAME}</text>\`,
    ...badgeShapes(badge),
    '</svg>',
    '',
  ].join('\\n');
}

function drawHeader(page) {
  mkdirSync(dirname(HEADER_IMAGE), { recursive: true });
  writeFileSync(HEADER_IMAGE, headerImage(badgeText(page)));
}

test('criterion 1: the header shows the item count and the total together in one badge', () => {
  const page = renderPage(addItem(emptyCart(), 'MUG-01', 2));
  drawHeader(page);
  assert.equal(badgeText(page), '2 items, $36.00');
});

test('criterion 2: one item is worded in the singular', () => {
  const page = renderPage(addItem(emptyCart(), 'MUG-01', 1));
  assert.equal(badgeText(page), '1 item, $18.00');
});

test('criterion 3: an empty cart shows zero items and a zero total', () => {
  assert.equal(badgeText(renderPage(emptyCart())), '0 items, $0.00');
});

test('criterion 4: the lines of a cart add up in the badge', () => {
  const page = renderPage(addItem(addItem(emptyCart(), 'MUG-01', 2), 'TEE-02', 1));
  assert.equal(badgeText(page), '3 items, $62.00');
});

test('criterion 5: the wording of a count comes from countLabel', () => {
  assert.equal(typeof labels.countLabel, 'function', 'src/labels.js exports countLabel');
  assert.equal(labels.countLabel(1, 'item'), '1 item');
  assert.equal(labels.countLabel(2, 'item'), '2 items');
  assert.equal(labels.countLabel(0, 'item'), '0 items');
});
`,
};

export const LABELS_MODULE: StoryFile = {
  path: 'src/labels.js',
  content: `const SINGULAR_COUNT = 1;
const PLURAL_SUFFIX = 's';

export function countLabel(count, noun) {
  const word = count === SINGULAR_COUNT ? noun : \`\${noun}\${PLURAL_SUFFIX}\`;
  return \`\${count} \${word}\`;
}
`,
};

export const RENDER_WITH_BADGE: StoryFile = {
  path: 'src/render.js',
  content: `import { CATALOG } from './catalog.js';
import { itemCount, subtotalCents } from './cart.js';
import { countLabel } from './labels.js';
import { formatCents } from './pricing.js';

const ITEM_NOUN = 'item';

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function productRow(product) {
  return \`<li data-sku="\${product.sku}"><span>\${escapeHtml(product.name)}</span> <strong>\${formatCents(product.priceCents)}</strong></li>\`;
}

function cartBadge(cart) {
  return \`<span class="cart-badge">\${countLabel(itemCount(cart), ITEM_NOUN)}, \${formatCents(subtotalCents(cart))}</span>\`;
}

export function renderPage(cart) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Storefront</title></head>',
    '<body>',
    \`<header><h1>Storefront</h1><p class="cart-summary">\${cartBadge(cart)}</p></header>\`,
    \`<main><ul class="catalog">\${CATALOG.map(productRow).join('')}</ul></main>\`,
    '</body>',
    '</html>',
  ].join('\\n');
}
`,
};

export const RENDER_TEST_WITH_BADGE: StoryFile = {
  path: 'test/render.test.js',
  content: String.raw`import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addItem, emptyCart } from '../src/cart.js';
import { renderPage } from '../src/render.js';

test('shows the cart summary in the header', () => {
  const page = renderPage(addItem(emptyCart(), 'MUG-01', 2));
  assert.match(page, /<p class="cart-summary"><span class="cart-badge">2 items, \$36\.00<\/span><\/p>/);
});

test('lists every product of the catalogue', () => {
  assert.equal(renderPage(emptyCart()).match(/<li data-sku=/g)?.length, 4);
});
`,
};
