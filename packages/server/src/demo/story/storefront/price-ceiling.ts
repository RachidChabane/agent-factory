import { nodeTestChecks } from '../story-helpers.ts';
import type { StoryProposedIssue } from '../story-types.ts';
import { PRICE_CEILING_TITLE } from './gift-finding-request.ts';
import { PRICE_CEILING_CHECK, PRICE_CEILING_MODULE } from './price-ceiling.files.ts';

export const PRICE_CEILING: StoryProposedIssue = {
  title: PRICE_CEILING_TITLE,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: four criteria on one function that does not exist yet.',
      'Where the specification allows it, the ceilings of the checks come from the catalogue itself, so they hold whichever prices the products carry; the module is loaded with a guarded import.',
      'Writing test/acceptance/price-ceiling.test.js and the manifest, then running the command once.',
    ],
    files: [PRICE_CEILING_CHECK],
    descriptions: [
      'A ceiling of $25 lists the mug, the cap and the tote bag in catalogue order',
      'A product priced exactly at the ceiling is included',
      'A ceiling below the cheapest price lists nothing',
      'A ceiling that is negative or not a whole number of cents is refused',
    ],
    final:
      'Wrote test/acceptance/price-ceiling.test.js with one test per criterion. On the current code all four tests fail on an assertion: src/price-ceiling.js does not exist yet.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the four frozen checks.',
        'A ceiling that is not a whole number of cents from 0 upwards is refused before the catalogue is read; otherwise every product priced at or below it is kept, in catalogue order.',
        'Writing src/price-ceiling.js.',
      ],
      writes: [PRICE_CEILING_MODULE],
      deletes: [],
      final:
        'Added src/price-ceiling.js with productsUpTo(maxCents), which raises a RangeError for a ceiling that is negative or not a whole number of cents. src/catalog.js is untouched.',
    },
  ],
  review: {
    says: 'The four criteria are met and the frozen checks are untouched. No gaps to report.',
    findings: [],
  },
};
