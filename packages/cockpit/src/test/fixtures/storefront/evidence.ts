import { evidencePath, type Evidence } from '../../../contract/index.ts';
import { STOREFRONT_ID } from '../project-ids.ts';
import { sha } from '../time.ts';
import { headSha, ISSUE, PULL_REQUEST } from './ids.ts';
import { CHECK_PATH } from './paths.ts';

const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 800;

function baseSha(pullRequest: number): string {
  return sha(`${STOREFRONT_ID}:base:${pullRequest}`);
}

function file(issueNumber: number, path: string): string {
  return evidencePath(STOREFRONT_ID, issueNumber, path);
}

/** The evidence of the natural-language search. */
export function searchEvidence(): Evidence[] {
  const issue = ISSUE.naturalLanguageSearch;
  return [
    {
      kind: 'image-compare',
      id: 'search-results',
      title: 'Search results for "blue sneakers under 60"',
      caption: 'Before, the sentence is searched as plain words. After, the colour and the price become filters.',
      beforeUrl: file(issue, 'screenshots/search-before.png'),
      afterUrl: file(issue, 'screenshots/search-after.png'),
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    },
    {
      kind: 'recording',
      id: 'search-journey',
      title: 'Searching with a sentence',
      caption: 'Typing the sentence, reading the filter chips and removing the price chip.',
      url: file(issue, 'recordings/search-journey.webm'),
      posterUrl: file(issue, 'recordings/search-journey-poster.png'),
      durationMs: 14_200,
    },
    {
      kind: 'red-green',
      id: 'chips-unit-tests',
      title: 'Unit tests of the price phrases and the chips',
      command: 'pnpm --filter web exec vitest run src/search/filter-chips.test.ts',
      before: {
        outcome: 'failed',
        sha: baseSha(PULL_REQUEST.naturalLanguageSearch),
        log: ' FAIL  web/src/search/filter-chips.test.ts\nTypeError: parsePriceBound is not a function\n\n Test Files  1 failed (1)\n      Tests  3 failed (3)',
        summary: {
          passed: 0,
          failed: 3,
          skipped: 0,
          failures: [
            { test: 'price phrases > reads "under 60" as a maximum of 60 euros', message: 'parsePriceBound is not a function' },
            { test: 'price phrases > reads "over 25,50" as a minimum of 25.50 euros', message: 'parsePriceBound is not a function' },
            { test: 'price phrases > keeps only colours of the catalogue', message: 'filtersFromRewrite is not a function' },
          ],
          missing: [],
        },
      },
      after: {
        outcome: 'passed',
        sha: headSha(PULL_REQUEST.naturalLanguageSearch),
        log: ' ✓ web/src/search/filter-chips.test.ts (3 tests) 12ms\n\n Test Files  1 passed (1)\n      Tests  3 passed (3)',
        summary: { passed: 3, failed: 0, skipped: 0, failures: [], missing: [] },
      },
    },
    {
      kind: 'acceptance-tests',
      id: 'acceptance',
      title: 'Acceptance tests by criterion',
      runner: null,
      criteria: [
        { criterion: 1, text: 'A colour word of the catalogue filters the results to that colour.' },
        { criterion: 2, text: '"under 60", "less than 60" and "up to 60" filter to a maximum of 60 euros; "over 60" and "more than 60" to a minimum.' },
        { criterion: 3, text: 'The active filters are shown as removable chips above the results.' },
        { criterion: 4, text: 'A word that is neither a catalogue colour nor a price phrase stays in the search terms.' },
      ],
      rows: [
        { criterion: 1, test: CHECK_PATH.searchJourney, name: 'turns a sentence into filters the customer can see and remove', base: 'red-assertion', branch: 'green' },
        { criterion: 2, test: CHECK_PATH.searchChips, name: 'price phrases > reads "under 60" as a maximum of 60 euros', base: 'red-error', branch: 'green' },
        { criterion: 2, test: CHECK_PATH.searchChips, name: 'price phrases > reads "over 25,50" as a minimum of 25.50 euros', base: 'red-error', branch: 'green' },
        { criterion: 3, test: CHECK_PATH.searchJourney, name: 'turns a sentence into filters the customer can see and remove', base: 'red-assertion', branch: 'green' },
        { criterion: 4, test: CHECK_PATH.searchChips, name: 'price phrases > keeps only colours of the catalogue', base: 'red-error', branch: 'green' },
      ],
    },
    {
      kind: 'eval-scores',
      id: 'query-understanding',
      title: 'Query understanding',
      runsPerCase: 3,
      minimumDelta: 0.1,
      regressionTolerance: 0.02,
      cases: [
        { caseId: 'blue-under-60', label: 'blue sneakers under 60', targeted: true, baseScore: 0.33, branchScore: 1 },
        { caseId: 'mug-over-25', label: 'mug over 25,50', targeted: true, baseScore: 0, branchScore: 1 },
        { caseId: 'no-filter', label: 'garden hose', targeted: false, baseScore: 1, branchScore: 1 },
        { caseId: 'unknown-colour', label: 'tartan scarf', targeted: false, baseScore: 1, branchScore: 1 },
        { caseId: 'red-kettle-up-to-40', label: 'red kettle up to 40', targeted: true, baseScore: 0.67, branchScore: 1 },
        { caseId: 'white-trainers-under-35', label: 'white trainers less than 35', targeted: true, baseScore: 0.5, branchScore: 1 },
      ],
    },
    {
      kind: 'report',
      id: 'summary',
      title: 'Summary of the change',
      body: [
        '## Natural-language search',
        '',
        'The search box understands colour words and price phrases. The query rewrite prompt now returns the colour, and a small parser reads the price bound; both become removable chips above the results.',
        '',
        '- Score of the evaluation: 0.58 before, 1.00 after (6 sentences, 3 runs each).',
        '- The first review found that "under 60" was read as a minimum; the second round has one non-blocking finding about a code comment.',
      ].join('\n'),
    },
  ];
}

/** The evidence of the checkout address form. */
export function checkoutEvidence(): Evidence[] {
  const issue = ISSUE.checkoutScreenReader;
  return [
    {
      kind: 'image-compare',
      id: 'address-form-errors',
      title: 'The address form after a failed submit',
      caption: 'Before, the errors appear next to each field only. After, a summary lists every problem and takes the focus.',
      beforeUrl: file(issue, 'screenshots/address-errors-before.png'),
      afterUrl: file(issue, 'screenshots/address-errors-after.png'),
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    },
    {
      kind: 'acceptance-tests',
      id: 'acceptance',
      title: 'Acceptance tests by criterion',
      runner: 'playwright',
      criteria: [
        { criterion: 1, text: 'After a failed submit the focus moves to a summary that lists every problem.' },
        { criterion: 2, text: 'Each entry of the summary links to its field.' },
        { criterion: 3, text: 'The summary is announced as an alert.' },
        { criterion: 4, text: 'A form without problems submits as before.' },
      ],
      rows: [
        { criterion: 1, test: CHECK_PATH.checkoutJourney, name: 'a keyboard user is told about every problem of the address form', base: 'red-assertion', branch: 'green' },
        { criterion: 2, test: CHECK_PATH.checkoutJourney, name: 'a keyboard user is told about every problem of the address form', base: 'red-assertion', branch: 'green' },
        { criterion: 3, test: CHECK_PATH.checkoutJourney, name: 'a keyboard user is told about every problem of the address form', base: 'red-assertion', branch: 'green' },
        { criterion: 4, test: 'e2e/checkout/address-submit.spec.ts', name: 'submits a valid address', base: 'green', branch: 'not-run' },
      ],
    },
    {
      kind: 'report',
      id: 'summary',
      title: 'Summary of the change',
      body: [
        '## Address form errors',
        '',
        'A failed submit now focuses an error summary announced as an alert, and each entry links to its field.',
        '',
        '- The recording of the keyboard journey could not be produced: the browser container ran out of disk space during the capture.',
      ].join('\n'),
    },
  ];
}

/** The evidence of the expired promo code message. */
export function expiredPromoEvidence(): Evidence[] {
  return [
    {
      kind: 'red-green',
      id: 'promo-messages',
      title: 'Unit tests of the promo messages',
      command: `pnpm --filter web exec vitest run ${CHECK_PATH.expiredPromo}`,
      before: {
        outcome: 'failed',
        sha: baseSha(PULL_REQUEST.expiredPromoMessage),
        log: ` FAIL  ${CHECK_PATH.expiredPromo}\nError: Failed to resolve import "./promo-messages"\n\n Test Files  1 failed (1)`,
        summary: { passed: 0, failed: 0, skipped: 0, failures: [], missing: ['promo-messages'] },
      },
      after: {
        outcome: 'passed',
        sha: headSha(PULL_REQUEST.expiredPromoMessage),
        log: ` ✓ ${CHECK_PATH.expiredPromo} (3 tests) 21ms\n\n Test Files  1 passed (1)\n      Tests  3 passed (3)`,
        summary: { passed: 3, failed: 0, skipped: 0, failures: [], missing: [] },
      },
    },
    {
      kind: 'report',
      id: 'summary',
      title: 'Summary of the change',
      body: 'An expired promo code now reads "This code expired on <date>" in the date format of the shop; an unknown code keeps its generic message. Both are announced as alerts.',
    },
  ];
}

export function reportOnly(title: string, body: string): Evidence[] {
  return [{ kind: 'report', id: 'summary', title, body }];
}

export function acceptanceOnly(runner: 'vitest' | 'playwright' | 'node-test', test: string, name: string, criteria: readonly string[]): Evidence[] {
  return [
    {
      kind: 'acceptance-tests',
      id: 'acceptance',
      title: 'Acceptance tests by criterion',
      runner,
      criteria: criteria.map((text, index) => ({ criterion: index + 1, text })),
      rows: criteria.map((_, index) => ({ criterion: index + 1, test, name, base: 'red-assertion', branch: 'green' })),
    },
  ];
}
