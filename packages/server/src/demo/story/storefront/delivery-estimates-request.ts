import { lines, paragraphs } from '../story-helpers.ts';
import { REQUESTER_SAM } from '../story-people.ts';
import type { StoryRequest } from '../story-types.ts';

const TITLE = 'Show delivery estimates on product pages';

export const DELIVERY_ESTIMATES: StoryRequest = {
  key: 'delivery-estimates',
  title: TITLE,
  requester: REQUESTER_SAM,
  body: `${paragraphs(
    `# ${TITLE}`,
    'Hi,',
    'Customers ask us every week how long delivery takes before they order, and the answer only comes in the confirmation email, after the purchase.',
    'Could we show an estimated delivery date next to each product, for example "Arrives Thursday 12 March", so that people know before they buy? I think it would reduce abandoned carts for gifts that are needed by a given date.',
    lines('Thanks,', 'Sam'),
  )}\n`,
  challenge: {
    summary:
      'Sam asks for a delivery date next to each product. The shop has no carrier, warehouse or shipping data, so any date it showed would be invented; the request is declined until that data exists.',
    items: [
      {
        title: 'Show an estimated delivery date next to each product',
        verdict: 'decline',
        currentState:
          'The shop renders one catalogue page (src/render.js:13) with a name and a price per product (src/render.js:10). There are no product pages, and nothing knows a carrier, a warehouse or a cut-off time: a product holds a SKU, a name and a price only (src/catalog.js:2).',
        intent: 'A customer deciding whether a purchase arrives in time sees a delivery date before buying.',
        idea: 'Show an estimated arrival date next to each product.',
        method: "A date computed from the time of the order, the warehouse's daily cut-off and the carrier's transit time.",
        reason:
          "The date depends on the carrier's transit times and the warehouse cut-off, and the shop has neither. A date computed without them is a promise the shop cannot keep, and a parcel that arrives after an estimate costs more support time than the missing estimate does.",
        question: null,
        sources: [
          { label: 'Catalogue page', reference: 'src/render.js:13' },
          { label: 'Product data', reference: 'src/catalog.js:2' },
          { label: 'Cart and totals', reference: 'src/cart.js:27' },
        ],
      },
    ],
    specs: [],
    reply:
      "Hi Sam, thanks for the request. We can't show delivery estimates yet: the shop has no carrier or warehouse data, so any date would be a guess. If you can send us the carrier's transit-time table and the warehouse cut-off time, we will look at it again.",
  },
  accept: [],
};
