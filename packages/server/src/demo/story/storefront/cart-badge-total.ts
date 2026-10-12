import { nodeTestChecks, paragraphs } from '../story-helpers.ts';
import type { StoryIssue } from '../story-types.ts';
import { CART_BADGE_TOTAL_CHECK, LABELS_MODULE, RENDER_TEST_WITH_BADGE, RENDER_WITH_BADGE } from './cart-badge-total.files.ts';

const HEADER_IMAGE = 'test-results/cart-badge.svg';

export const CART_BADGE_TOTAL: StoryIssue = {
  key: 'cart-badge-total',
  spec: {
    title: 'Show the item count and total in the header badge',
    type: 'feature',
    need: paragraphs(
      'The header prints the cart as plain text, "2 items, $36.00", and says "1 items" for a single item. It should read as a badge: the count and the total together in one element the page can style, with the count worded correctly for one item and for several.',
      'The wording of a count is needed on other screens too, so it comes from one shared helper, `countLabel(count, noun)` in `src/labels.js`, instead of being rebuilt wherever a count is shown.',
    ),
    acceptanceCriteria: [
      'The header contains one element with the class `cart-badge` that holds the item count and the cart total, for example `<span class="cart-badge">2 items, $36.00</span>` for two enamel mugs.',
      'A cart with one item is worded in the singular: one enamel mug shows `1 item, $18.00`.',
      'An empty cart shows `0 items, $0.00` in the badge.',
      'The lines of a cart add up in the badge: two enamel mugs and an organic cotton tee show `3 items, $62.00`.',
      "`countLabel(1, 'item')` is `1 item`, `countLabel(2, 'item')` is `2 items` and `countLabel(0, 'item')` is `0 items`.",
    ],
    outOfScope: [
      'How the badge looks: the markup carries the class, and the styling is a separate change.',
      'Linking the badge to a cart page.',
      'Nouns whose plural is not the singular followed by an s.',
    ],
    expectedProof:
      'Unit tests of `renderPage` for carts of zero, one and several items, and of `countLabel`. The page tests read the text of the badge element and compare it with the expected wording. The first of them also draws the header it rendered as an image, so that the pull request shows the header before and after the change.',
  },
  dependsOn: [],
  validate: true,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: four criteria on the rendered header and one on the wording helper.',
      'The page and the cart exist today, so those checks call renderPage and read the text of the badge element; the helper does not exist yet, so it is loaded with a guarded import.',
      'The first check also draws the header it rendered to test-results/cart-badge.svg before it asserts, and the manifest lists that file as evidence, so the pull request can show the header before and after.',
      'Writing test/acceptance/cart-badge-total.test.js and the manifest, then running the command once.',
    ],
    files: [CART_BADGE_TOTAL_CHECK],
    descriptions: [
      'The header badge holds the count and the total',
      'One item is worded in the singular',
      'An empty cart reads 0 items, $0.00',
      'A cart of several lines adds up in the badge',
      'countLabel words one item, several items and none',
    ],
    evidence: [HEADER_IMAGE],
    final:
      'Wrote test/acceptance/cart-badge-total.test.js with one test per criterion; the first draws the header to test-results/cart-badge.svg, which the manifest lists as evidence. On the current code all five tests fail on an assertion: the header has no badge element, so the image shows the header without one, and src/labels.js does not exist.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the five frozen checks.',
        'The header already prints the count and the total, so the work is the wording of the count and the element around it. The wording gets a module of its own so that other screens can use it.',
        'Writing src/labels.js and rewriting the header in src/render.js.',
      ],
      writes: [LABELS_MODULE, RENDER_WITH_BADGE],
      deletes: [],
      final:
        'Added src/labels.js with countLabel(count, noun). src/render.js now shows the count and the total in a span with the class cart-badge and words the count with countLabel.',
    },
    {
      says: [
        'The gate refused the first version: the existing header test still expects the old markup, without the badge element.',
        'That test describes the behaviour this change replaces, so it follows the new markup. The frozen checks stay as they are.',
        'Updating test/render.test.js.',
      ],
      writes: [RENDER_TEST_WITH_BADGE],
      deletes: [],
      final:
        'test/render.test.js now expects the count and the total inside the cart-badge element. src/labels.js and src/render.js are as in the first version.',
    },
  ],
  review: {
    says: 'The change meets the five criteria and leaves the frozen checks untouched. The one existing test that described the old header markup is updated, which the change makes necessary. No gaps to report.',
    findings: [],
  },
};
