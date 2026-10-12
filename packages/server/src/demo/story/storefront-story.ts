import { STOREFRONT_ID } from '../demo-projects.ts';
import { CART_BADGE_TOTAL } from './storefront/cart-badge-total.ts';
import { CATEGORY_FILTER } from './storefront/category-filter.ts';
import { DELIVERY_ESTIMATES } from './storefront/delivery-estimates-request.ts';
import { DISCOUNT_ROUNDING } from './storefront/discount-rounding.ts';
import { GIFT_FINDING } from './storefront/gift-finding-request.ts';
import { GIFT_PICKS } from './storefront/gift-picks.ts';
import { ORDER_HISTORY_PAGINATION } from './storefront/order-history-pagination.ts';
import { NODE_24, TOTE_PRICE } from './storefront/outside-changes.ts';
import { PRICE_CEILING } from './storefront/price-ceiling.ts';
import { SAVED_CARTS } from './storefront/saved-carts-request.ts';
import type { ProjectStory } from './story-types.ts';

const RELEASE_TAG = 'v1.5.0';

export const STOREFRONT_STORY: ProjectStory = {
  project: STOREFRONT_ID,
  requests: [GIFT_FINDING, SAVED_CARTS, DELIVERY_ESTIMATES],
  issues: [CATEGORY_FILTER, CART_BADGE_TOTAL, DISCOUNT_ROUNDING, ORDER_HISTORY_PAGINATION],
  proposedIssues: [GIFT_PICKS, PRICE_CEILING],
  outsideChanges: [TOTE_PRICE, NODE_24],
  merges: [CATEGORY_FILTER.key],
  release: RELEASE_TAG,
};
