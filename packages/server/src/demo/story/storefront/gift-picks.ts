import { nodeTestChecks } from '../story-helpers.ts';
import type { StoryProposedIssue } from '../story-types.ts';
import { GIFT_PICKS_TITLE } from './gift-finding-request.ts';
import { GIFT_PICKS_CHECK, GIFT_PICKS_MODULE } from './gift-picks.files.ts';

export const GIFT_PICKS: StoryProposedIssue = {
  title: GIFT_PICKS_TITLE,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: four criteria on one function that does not exist yet.',
      'The checks compare the gift picks with the catalogue itself, so they hold whichever prices the products carry; the module is loaded with a guarded import.',
      'Writing test/acceptance/gift-picks.test.js and the manifest, then running the command once.',
    ],
    files: [GIFT_PICKS_CHECK],
    descriptions: [
      'The gift picks come in catalogue order',
      'The mug, the cap and the tote bag are gift picks and the tee is not',
      'Every gift pick is a product of the catalogue',
      'Every call answers with a new list',
    ],
    final:
      'Wrote test/acceptance/gift-picks.test.js with one test per criterion. On the current code all four tests fail on an assertion: src/gift-picks.js does not exist yet.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the four frozen checks.',
        'The gift picks are a short list of SKUs and the function filters the catalogue by it: the catalogue order, and the rule that only products the shop sells are returned, both come from the catalogue itself. Every call builds a new list.',
        'Writing src/gift-picks.js.',
      ],
      writes: [GIFT_PICKS_MODULE],
      deletes: [],
      final: 'Added src/gift-picks.js with giftPicks(): the enamel mug, the canvas cap and the tote bag, in catalogue order. src/catalog.js is untouched.',
    },
  ],
  review: {
    says: 'The four criteria are met and the frozen checks are untouched. One small gap that does not block the merge.',
    findings: [
      {
        severity: 'non-blocking',
        category: 'correctness',
        file: 'src/gift-picks.js',
        line: 3,
        summary:
          'A SKU of GIFT_PICK_SKUS that the catalogue does not hold is dropped without a sound, so a mistyped SKU loses a gift pick and nothing notices. The behaviour is what the third criterion asks for; a test that every listed SKU exists would catch the typo.',
      },
    ],
  },
};
