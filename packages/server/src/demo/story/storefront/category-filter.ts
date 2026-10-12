import { nodeTestChecks, paragraphs } from '../story-helpers.ts';
import type { StoryIssue } from '../story-types.ts';
import { CATEGORIES_MODULE, CATEGORY_FILTER_CHECK } from './category-filter.files.ts';

export const CATEGORY_FILTER: StoryIssue = {
  key: 'category-filter',
  spec: {
    title: 'Filter the catalogue by category',
    type: 'feature',
    need: paragraphs(
      'The product list grows with every season, and customers who know what kind of thing they want have to read all of it. Products need categories, and the catalogue needs to answer which products belong to a category, so that a filter on the page can show only those.',
      'The shop has three categories for its four products: kitchen (the enamel mug), apparel (the organic cotton tee and the canvas cap) and bags (the tote bag). They live in `src/categories.js`, next to the catalogue, and name products by their SKU.',
    ),
    acceptanceCriteria: [
      "`productsInCategory('apparel')` returns the organic cotton tee and the canvas cap, in catalogue order.",
      "`productsInCategory('kitchen')` returns the enamel mug and `productsInCategory('bags')` returns the tote bag.",
      'A category the shop does not have, such as `garden`, returns an empty list instead of failing.',
      'Every product of the catalogue is in exactly one category, so no product disappears from the filtered views and none shows twice.',
      '`CATEGORIES` lists the categories in a fixed order, kitchen, apparel, bags, each with an `id` and a display `name` (Kitchen, Apparel, Bags), so that a selector can be built from it.',
    ],
    outOfScope: [
      'The category selector on the page and the `category` parameter of the server, which build on these functions.',
      'Choosing several categories at once.',
      'Subcategories and category descriptions.',
    ],
    expectedProof:
      'Unit tests of `src/categories.js` against the real catalogue: the products of each category, an unknown category, and the rule that every product has exactly one category.',
  },
  dependsOn: [],
  validate: true,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: five criteria, all on the category module.',
      'The module does not exist yet, so the checks load it with a guarded import and assert on what it exports; everything else they import exists today.',
      'Writing test/acceptance/category-filter.test.js and the manifest, then running the command once.',
    ],
    files: [CATEGORY_FILTER_CHECK],
    descriptions: [
      'Apparel lists the tee and the cap in catalogue order',
      'Kitchen and bags list their own product',
      'An unknown category lists nothing',
      'Every product of the catalogue is in exactly one category',
      'The categories come in a fixed order with an id and a display name',
    ],
    final:
      'Wrote test/acceptance/category-filter.test.js with one test per criterion. Run on the current code, all five tests fail on an assertion because src/categories.js does not exist yet.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the five frozen checks.',
        'The catalogue stays the single list of products, so the categories only name SKUs and the filter reads the catalogue.',
        'Writing src/categories.js.',
      ],
      writes: [CATEGORIES_MODULE],
      deletes: [],
      final:
        'Added src/categories.js: CATEGORIES (kitchen, apparel and bags, each with its SKUs), findCategory and productsInCategory. src/catalog.js is untouched. An unknown category answers with an empty list.',
    },
  ],
  review: {
    says: 'The change meets the five criteria and leaves the catalogue and the frozen checks untouched. One small gap that does not block the merge.',
    findings: [
      {
        severity: 'non-blocking',
        category: 'correctness',
        file: 'src/categories.js',
        line: 10,
        summary:
          "findCategory compares the id exactly, so productsInCategory('Apparel') returns an empty list. A selector built from CATEGORIES never produces that input, but a value typed by hand in an address can.",
      },
    ],
  },
};
