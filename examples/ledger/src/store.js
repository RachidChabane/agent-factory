export function createInvoiceStore(invoices = []) {
  const byNumber = new Map(invoices.map((invoice) => [invoice.number, invoice]));
  return {
    get: (number) => byNumber.get(number),
    save: (invoice) => {
      byNumber.set(invoice.number, invoice);
    },
    all: () => [...byNumber.values()],
  };
}
