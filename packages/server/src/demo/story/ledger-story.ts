import { LEDGER_ID } from '../demo-projects.ts';
import { PAYMENT_RETRIES } from './ledger/payment-retries.ts';
import { PDF_INVOICES } from './ledger/pdf-invoices-request.ts';
import { TAX_ROUNDING } from './ledger/tax-rounding.ts';
import { WEBHOOK_SIGNATURES } from './ledger/webhook-signatures.ts';
import type { ProjectStory } from './story-types.ts';

export const LEDGER_STORY: ProjectStory = {
  project: LEDGER_ID,
  requests: [PDF_INVOICES],
  issues: [PAYMENT_RETRIES, WEBHOOK_SIGNATURES, TAX_ROUNDING],
  proposedIssues: [],
  outsideChanges: [],
  merges: [],
  release: null,
};
