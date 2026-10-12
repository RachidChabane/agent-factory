import { requestAttachmentPath, type RequestView } from '../../../contract/index.ts';
import { DANA, JORDAN, RILEY, SAM } from '../people.ts';
import { STOREFRONT_ID } from '../project-ids.ts';
import { runOf, type RunWorld } from '../runs.ts';
import { requestView } from '../seeds.ts';
import { days, type FixtureClock } from '../time.ts';
import { DELIVERY_TRACKING_CHALLENGE, LOYALTY_POINTS_CHALLENGE, ORDER_HISTORY_CHALLENGE, WISHLIST_SHARING_CHALLENGE } from './challenges.ts';
import { ISSUE, REQUEST, REQUEST_TITLE, RUN } from './ids.ts';

function endOf(runs: RunWorld, runId: string): string {
  const endedAt = runOf(runs, runId).endedAt;
  if (endedAt === null) throw new Error(`the run ${runId} has not ended`);
  return endedAt;
}

function titleOf(requestId: string): string {
  const title = REQUEST_TITLE[requestId];
  if (title === undefined) throw new Error(`no title for the request ${requestId}`);
  return title;
}

export function storefrontRequests(clock: FixtureClock, runs: RunWorld): RequestView[] {
  const minutesAgo = (minutes: number): string => clock.minutesAgo(minutes);
  return [
    requestView({
      id: REQUEST.promoExpiry,
      title: titleOf(REQUEST.promoExpiry),
      requester: DANA.name,
      channel: 'slack',
      receivedAt: minutesAgo(days(3)),
      updatedAt: minutesAgo(days(2)),
      state: 'accepted',
      body: 'Support keeps hearing from customers who typed a promo code that has ended. The page only says "Invalid code", so they think they made a typo and write to us. We want the page to say when a code has expired.',
      issueNumbers: [ISSUE.expiredPromoMessage],
    }),
    requestView({
      id: REQUEST.orderHistory,
      title: titleOf(REQUEST.orderHistory),
      requester: DANA.name,
      channel: 'slack',
      receivedAt: minutesAgo(days(12) + 10),
      updatedAt: minutesAgo(days(9)),
      state: 'accepted',
      body: 'Customers with a lot of orders cannot find the one they want. The page is slow for people with hundreds of orders, and they ask to filter by status, to search by product name and to export one order as a PDF for expense claims.',
      challenge: { runId: RUN.challengeOrderHistory, completedAt: endOf(runs, RUN.challengeOrderHistory), ...ORDER_HISTORY_CHALLENGE },
      issueNumbers: [ISSUE.orderHistoryPagination, ISSUE.orderHistoryStatusFilter],
    }),
    requestView({
      id: REQUEST.guestCheckout,
      title: titleOf(REQUEST.guestCheckout),
      requester: DANA.name,
      channel: 'email',
      receivedAt: minutesAgo(12),
      updatedAt: minutesAgo(12),
      state: 'received',
      body: 'Several customers who check out as guests lose their cart when they come back from the payment page. The screenshots show the empty cart, and the support thread has three more cases.',
      attachments: [
        { name: 'empty-cart-after-payment.png', url: requestAttachmentPath(STOREFRONT_ID, REQUEST.guestCheckout, 'empty-cart-after-payment.png'), mediaType: 'image/png' },
        { name: 'support-thread.pdf', url: requestAttachmentPath(STOREFRONT_ID, REQUEST.guestCheckout, 'support-thread.pdf'), mediaType: 'application/pdf' },
      ],
    }),
    requestView({
      id: REQUEST.giftWrapping,
      title: titleOf(REQUEST.giftWrapping),
      requester: RILEY.name,
      channel: 'slack',
      receivedAt: minutesAgo(35),
      updatedAt: minutesAgo(34),
      state: 'challenging',
      body: 'Customers ask for gift wrapping at checkout, with a message card. It would be a paid option at 3.50 euros per item and the warehouse is ready to handle it.',
    }),
    requestView({
      id: REQUEST.deliveryTracking,
      title: titleOf(REQUEST.deliveryTracking),
      requester: RILEY.name,
      channel: 'email',
      receivedAt: minutesAgo(360),
      updatedAt: minutesAgo(330),
      state: 'challenged',
      body: 'Customers write to support asking where their parcel is. We would like the order page to show the carrier\'s tracking status with a link to the tracking page, and an email when a parcel is delayed. A rating of the carrier after delivery would help too.',
      challenge: { runId: RUN.challengeDeliveryTracking, completedAt: endOf(runs, RUN.challengeDeliveryTracking), ...DELIVERY_TRACKING_CHALLENGE },
    }),
    requestView({
      id: REQUEST.wishlistSharing,
      title: titleOf(REQUEST.wishlistSharing),
      requester: JORDAN.name,
      channel: 'cockpit',
      receivedAt: minutesAgo(days(3)),
      updatedAt: minutesAgo(2890),
      state: 'waiting-requester',
      body: 'Friends and family ask what to buy for a birthday. A customer should be able to share a wishlist by link and turn the sharing off again.',
      challenge: { runId: RUN.challengeWishlistSharing, completedAt: endOf(runs, RUN.challengeWishlistSharing), ...WISHLIST_SHARING_CHALLENGE },
    }),
    requestView({
      id: REQUEST.loyaltyPoints,
      title: titleOf(REQUEST.loyaltyPoints),
      requester: SAM.name,
      channel: 'slack',
      receivedAt: minutesAgo(days(7)),
      updatedAt: minutesAgo(days(6)),
      state: 'declined',
      body: 'Returning customers should earn points on every order and spend them on later ones, with the balance shown in their account.',
      challenge: { runId: RUN.challengeLoyaltyPoints, completedAt: endOf(runs, RUN.challengeLoyaltyPoints), ...LOYALTY_POINTS_CHALLENGE },
      declineReason: 'Out of scope for the web shop: a points scheme needs a balance ledger and legal terms that no team owns yet.',
    }),
    requestView({
      id: REQUEST.returnsLabels,
      title: titleOf(REQUEST.returnsLabels),
      requester: JORDAN.name,
      channel: 'cockpit',
      receivedAt: minutesAgo(55),
      updatedAt: minutesAgo(41),
      state: 'received',
      body: 'Customers who want to return an item currently email us for a label. The order page should let them print a returns label for any delivered order.',
      lastChallengeFailure: { at: endOf(runs, RUN.challengeReturnsLabels), reason: 'The challenger run ended with outcome error: the model API answered "overloaded" twice in a row.' },
    }),
  ];
}
