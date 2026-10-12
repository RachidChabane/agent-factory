import type { StoryFile } from '../story-types.ts';

export const CATEGORY_FILTER_CHECK: StoryFile = {
  path: 'test/acceptance/category-filter.test.js',
  content: String.raw`import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG } from '../../src/catalog.js';

const categories = await import('../../src/categories.js').catch(() => ({}));

function skusOf(products) {
  return products.map((product) => product.sku);
}

function requireFilter() {
  assert.equal(typeof categories.productsInCategory, 'function', 'src/categories.js exports productsInCategory');
}

test('criterion 1: a category lists its products in catalogue order', () => {
  requireFilter();
  assert.deepEqual(skusOf(categories.productsInCategory('apparel')), ['TEE-02', 'CAP-03']);
});

test('criterion 2: every other category lists its own product', () => {
  requireFilter();
  assert.deepEqual(skusOf(categories.productsInCategory('kitchen')), ['MUG-01']);
  assert.deepEqual(skusOf(categories.productsInCategory('bags')), ['BAG-04']);
});

test('criterion 3: a category the shop does not have lists nothing', () => {
  requireFilter();
  assert.deepEqual(categories.productsInCategory('garden'), []);
});

test('criterion 4: every product of the catalogue is in exactly one category', () => {
  requireFilter();
  assert.equal(Array.isArray(categories.CATEGORIES), true, 'src/categories.js exports CATEGORIES');
  const listed = categories.CATEGORIES.flatMap((category) => skusOf(categories.productsInCategory(category.id)));
  assert.deepEqual([...listed].sort(), skusOf(CATALOG).sort());
});

test('criterion 5: the categories come in a fixed order with an id and a display name', () => {
  assert.equal(Array.isArray(categories.CATEGORIES), true, 'src/categories.js exports CATEGORIES');
  assert.deepEqual(
    categories.CATEGORIES.map((category) => [category.id, category.name]),
    [
      ['kitchen', 'Kitchen'],
      ['apparel', 'Apparel'],
      ['bags', 'Bags'],
    ],
  );
});
`,
};

export const CATEGORIES_MODULE: StoryFile = {
  path: 'src/categories.js',
  content: String.raw`import { CATALOG } from './catalog.js';

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'kitchen', name: 'Kitchen', skus: Object.freeze(['MUG-01']) }),
  Object.freeze({ id: 'apparel', name: 'Apparel', skus: Object.freeze(['TEE-02', 'CAP-03']) }),
  Object.freeze({ id: 'bags', name: 'Bags', skus: Object.freeze(['BAG-04']) }),
]);

export function findCategory(id) {
  return CATEGORIES.find((category) => category.id === id) ?? null;
}

export function productsInCategory(id) {
  const category = findCategory(id);
  if (category === null) return [];
  return CATALOG.filter((product) => category.skus.includes(product.sku));
}
`,
};
