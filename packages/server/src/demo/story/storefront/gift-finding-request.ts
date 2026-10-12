import { lines, paragraphs } from '../story-helpers.ts';
import { REQUESTER_DANA } from '../story-people.ts';
import type { StoryRequest } from '../story-types.ts';

const FIRST_PROPOSED_SPEC = 0;
const TITLE = 'Help customers find gifts faster';

export const GIFT_PICKS_TITLE = 'Mark gift picks in the catalogue';
export const PRICE_CEILING_TITLE = 'Filter the catalogue by price ceiling';

export const GIFT_FINDING: StoryRequest = {
  key: 'gift-finding',
  title: TITLE,
  requester: REQUESTER_DANA,
  body: `${paragraphs(
    `# ${TITLE}`,
    'Hi team,',
    'Last December we had a pile of messages from people who knew they wanted to buy something for someone else but could not tell what to pick. The catalogue is four products today and it will be a dozen by spring, so this is going to get worse, not better.',
    paragraphs(
      'Three things I would like us to look at:',
      lines(
        '1. Gift picks. Mark the products we are happy to recommend as gifts, and let customers see only those.',
        '2. A budget. People keep asking "what can I get for under $25?", so a way to browse by price.',
        '3. A short quiz at the top of the page ("who is it for, what do they like?") that suggests two or three products.',
      ),
    ),
    "The first one matters most to me: it is the cheapest and it helps everyone. If the quiz needs data we do not have, let's say so rather than build something that guesses.",
    lines('Thanks,', 'Dana'),
  )}\n`,
  challenge: {
    summary:
      'Dana asks for three ways to help customers find a gift. Marking gift picks is worth building now and needs nothing beyond a list of SKUs. The budget is better served by a price ceiling over the whole catalogue than by a gift-only budget. The quiz depends on product tags that nobody owns yet, so it waits for an answer to the question below.',
    items: [
      {
        title: 'Mark the products that make good gifts',
        verdict: 'keep',
        currentState:
          'The catalogue is a frozen list of four products with a SKU, a name and a price (src/catalog.js:1); nothing records which products are good gifts, and the page renders every product the same way (src/render.js:9).',
        intent: 'A customer shopping for someone else sees the products the team recommends as gifts and can ignore the rest.',
        idea: 'Flag gift picks as data and expose them as a list the page can show on its own.',
        method:
          'A list of gift-pick SKUs and a giftPicks() function in a module of their own, src/gift-picks.js, that returns the matching catalogue entries in catalogue order. The page keeps rendering through productRow.',
        reason: 'It is the cheapest of the three and useful on its own, and the other two items can reuse the same list.',
        question: null,
        sources: [
          { label: 'Catalogue', reference: 'src/catalog.js:1' },
          { label: 'Product row markup', reference: 'src/render.js:9' },
        ],
      },
      {
        title: 'Browse gifts by budget',
        verdict: 'adjust',
        currentState:
          'Prices are stored in cents on each product (src/catalog.js:2) and the cart can total them (src/cart.js:27), but nothing filters or sorts products by price.',
        intent: 'A customer with a budget sees only what they can afford for the gift.',
        idea: 'A price ceiling that applies to the whole catalogue instead of a budget that applies to gift picks only.',
        method: 'A productsUpTo(maxCents) function over the catalogue, in a module of its own, src/price-ceiling.js, independent of the gift marking.',
        reason:
          'A gift-only budget would leave customers with almost nothing to browse while the picks are few. A ceiling on the whole catalogue answers "what can I get for under $25?" directly and still works on gift picks when both are applied.',
        question: null,
        sources: [
          { label: 'Prices', reference: 'src/catalog.js:2' },
          { label: 'Cart totals', reference: 'src/cart.js:27' },
        ],
      },
      {
        title: 'Suggest gifts with a short quiz',
        verdict: 'ask',
        currentState:
          'No product carries a recipient, an occasion or an interest (src/catalog.js:2); with four products the quiz would have almost nothing to choose between.',
        intent: 'A customer who does not know what to buy gets two or three suggestions.',
        idea: 'Match the quiz answers against tags on the products.',
        method: 'Tags per product and a matching function; the quiz itself is page work.',
        reason: 'The quiz is only as good as its tags, and tagging is merchandising work, not code: someone has to decide the tags and keep them current.',
        question:
          'Who will tag the products with a recipient and an occasion, and keep the tags up to date as the range grows in spring? Without an owner the quiz would suggest the same two products to everyone.',
        sources: [{ label: 'Catalogue entries', reference: 'src/catalog.js:2' }],
      },
    ],
    specs: [
      {
        title: GIFT_PICKS_TITLE,
        type: 'feature',
        items: [1],
        need: 'Customers shopping for someone else cannot tell which products the team recommends as gifts. The catalogue needs a way to say which products are gift picks, and a function that returns them, so that the page can show them on their own.',
        acceptanceCriteria: [
          '`giftPicks()` in `src/gift-picks.js` returns the products marked as gift picks, in catalogue order.',
          'The enamel mug, the canvas cap and the tote bag are gift picks; the organic cotton tee is not.',
          'Every gift pick is a product of the catalogue: a SKU the shop does not sell is never returned.',
          '`giftPicks()` returns a new list on every call, so a caller cannot change what the next caller sees.',
        ],
        outOfScope: [
          'The control on the page that shows only gift picks.',
          'Choosing gift picks per customer or per season.',
          'Tags other than gift pick, such as a recipient or an occasion.',
        ],
        expectedProof: 'Unit tests of `giftPicks()` against the real catalogue.',
      },
      {
        title: PRICE_CEILING_TITLE,
        type: 'feature',
        items: [2],
        need: 'Customers with a budget have to read every price to find what they can afford. The catalogue needs a function that returns the products that cost at most a given amount, so that the page can offer "up to $25".',
        acceptanceCriteria: [
          '`productsUpTo(maxCents)` in `src/price-ceiling.js` returns the products priced at or below `maxCents`, in catalogue order: 2500 returns the enamel mug, the canvas cap and the tote bag.',
          'A product priced exactly at the ceiling is included.',
          'A ceiling below the cheapest price returns an empty list.',
          'A ceiling that is negative or not a whole number of cents is refused with a `RangeError`.',
        ],
        outOfScope: ['Sorting by price.', 'A minimum price, and ranges.', 'The ceiling control on the page.'],
        expectedProof: 'Unit tests of `productsUpTo` against the real catalogue.',
      },
    ],
    reply:
      'Hi Dana, thanks, this is clear. We will start with gift picks and with a price ceiling over the whole catalogue, so that "under $25" works whether or not a product is a gift pick. The quiz needs tags on every product: who will own tagging the range and keep it current as it grows in spring? Once we know, we can scope it.',
  },
  accept: [FIRST_PROPOSED_SPEC],
};
