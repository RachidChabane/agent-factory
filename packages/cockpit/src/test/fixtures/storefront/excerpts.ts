/** Excerpts of the storefront repository that agent sessions read. */
export const ORDERS_PAGE_EXCERPT = [
  'export function OrdersPage() {',
  '  const { orders, pending, error } = useOrders();',
  '  if (pending) return <OrderListSkeleton />;',
  '  if (error) return <ErrorPanel error={error} />;',
  '  return <OrderList orders={orders} />;',
  '}',
].join('\n');

export const MONEY_EXCERPT = [
  'export function formatMoney(cents: number, shop: ShopId): string {',
  '  return new Intl.NumberFormat(SHOP_LOCALES[shop], {',
  "    style: 'currency',",
  '    currency: SHOP_CURRENCIES[shop],',
  '  }).format(cents / 100);',
  '}',
].join('\n');
