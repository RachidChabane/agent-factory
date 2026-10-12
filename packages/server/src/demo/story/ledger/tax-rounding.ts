import { nodeTestChecks, paragraphs } from '../story-helpers.ts';
import type { StoryIssue } from '../story-types.ts';
import { INVOICES_WITH_ONE_VAT_ROUNDING, TAX_ROUNDING_CHECK } from './tax-rounding.files.ts';

export const TAX_ROUNDING: StoryIssue = {
  key: 'tax-rounding',
  spec: {
    title: 'Round VAT once on the invoice total',
    type: 'fix',
    need: paragraphs(
      "VAT is computed line by line: the VAT of every line is rounded to the cent and the rounded amounts are added up. On an invoice with several lines the sum can differ from the VAT of the subtotal by a cent or more, so the amount the ledger asks for no longer matches what the customer's accountant computes from the subtotal.",
      'VAT should be computed once, on the invoice subtotal, and rounded half up to the cent.',
    ),
    acceptanceCriteria: [
      'An invoice of three lines of $19.99 at 20% VAT carries 1199 cents of VAT, not the 1200 cents that rounding every line gives, and a total of 7196 cents.',
      'The VAT is rounded half up to the cent: an invoice of two lines of $5.05 at 5% VAT carries 51 cents of VAT, because 5% of $10.10 is 50.5 cents.',
      'A payment of the total of the first invoice, 7196 cents, settles it: the balance is zero and the invoice reads as settled.',
    ],
    outOfScope: [
      'Rates that differ from line to line, such as a reduced rate.',
      'Recomputing the VAT of invoices that were already issued.',
      'Credit notes.',
    ],
    expectedProof:
      'Unit tests that build invoices whose line-by-line and whole-invoice roundings differ and check the VAT, the total and the balance. They fail on the current code, which rounds every line.',
  },
  dependsOn: [],
  validate: false,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: three criteria on the invoice functions.',
      'The invoice functions exist today, so the checks build invoices where the line-by-line and the whole-invoice roundings differ, and compare the VAT, the total and the balance.',
      'Writing test/acceptance/tax-rounding.test.js and the manifest, then running the command once.',
    ],
    files: [TAX_ROUNDING_CHECK],
    descriptions: ['VAT is computed once on the subtotal', 'VAT is rounded half up', 'Paying the total settles the invoice'],
    final:
      'Wrote test/acceptance/tax-rounding.test.js with one test per criterion. On the current code all three tests fail on an assertion: the VAT is 1200 cents instead of 1199, and 50 instead of 51.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the three frozen checks.',
        'vatCents sums the VAT of every line. The VAT of the subtotal is what the specification asks for, and subtotalCents and percentOf already exist.',
        'Changing vatCents in src/invoices.js.',
      ],
      writes: [INVOICES_WITH_ONE_VAT_ROUNDING],
      deletes: [],
      final: 'src/invoices.js computes the VAT once, on the subtotal, with percentOf. The existing invoice tests pass unchanged.',
    },
  ],
  review: {
    says: 'The three criteria are met, the frozen checks are untouched and the existing tests pass unchanged. No gaps to report.',
    findings: [],
  },
};
