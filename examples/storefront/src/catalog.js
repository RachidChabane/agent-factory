export const CATALOG = Object.freeze([
  Object.freeze({ sku: 'MUG-01', name: 'Enamel mug', priceCents: 1800 }),
  Object.freeze({ sku: 'TEE-02', name: 'Organic cotton tee', priceCents: 2600 }),
  Object.freeze({ sku: 'CAP-03', name: 'Canvas cap', priceCents: 2200 }),
  Object.freeze({ sku: 'BAG-04', name: 'Tote bag', priceCents: 1500 }),
]);

export function findProduct(sku) {
  return CATALOG.find((product) => product.sku === sku) ?? null;
}
