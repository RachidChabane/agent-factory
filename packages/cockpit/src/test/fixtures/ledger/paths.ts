export const CHECK_PATH = {
  idempotency: 'tests/test_idempotency_keys.py',
  taxRounding: 'tests/test_tax_rounding.py',
  webhookSignatures: 'tests/test_webhook_signatures.py',
  invoiceService: 'tests/test_invoice_service.py',
  paymentRetries: 'tests/test_payment_retries.py',
  csvExport: 'tests/test_invoice_csv_export.py',
} as const;

export const DOCS_PATH = 'docs/invoice-lifecycle.md';
