import type { ReviewFindingView } from '../../../contract/index.ts';
import { WEBHOOK_CANDIDATES_LINE, WEBHOOK_SIGNATURE_PATH } from './diffs.ts';
import { RUN } from './ids.ts';

export const REVIEW_FINDINGS: Readonly<Record<string, readonly ReviewFindingView[]>> = {
  [RUN.invoiceLifecycleDocsReview]: [],
  [RUN.idempotencyReview]: [
    {
      severity: 'non-blocking',
      category: 'criteria-coverage',
      file: 'src/ledger/payments/idempotency.py',
      line: 7,
      summary: 'The refusal for a reused key does not name the header that caused it; the criterion asks for a clear message.',
      resolved: true,
    },
  ],
  [RUN.taxRoundingReview]: [],
  [RUN.webhookReview]: [
    {
      severity: 'non-blocking',
      category: 'security',
      file: WEBHOOK_SIGNATURE_PATH,
      line: WEBHOOK_CANDIDATES_LINE,
      summary: 'The previous secret is accepted without an end date; limit it to the rotation window so that a leaked secret stops working.',
      resolved: false,
    },
  ],
};
