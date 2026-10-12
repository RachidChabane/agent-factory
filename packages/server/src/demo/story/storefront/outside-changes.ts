import { DANA_REYES, DEPENDENCY_BOT } from '../story-people.ts';
import type { StoryOutsideChange } from '../story-types.ts';
import { CART_TEST_WITH_NEW_TOTE_PRICE, CATALOG_WITH_NEW_TOTE_PRICE, PACKAGE_FOR_NODE_24 } from './outside-changes.files.ts';

export const TOTE_PRICE: StoryOutsideChange = {
  key: 'tote-price',
  author: DANA_REYES,
  message: 'fix: correct the tote bag price',
  files: [CATALOG_WITH_NEW_TOTE_PRICE, CART_TEST_WITH_NEW_TOTE_PRICE],
  branch: null,
  verdict: {
    verdict: 'challenge',
    summary: 'The tote bag price went from $15.00 to $16.00 in a direct push whose message and tests do not say where the new price comes from.',
    findings: [
      {
        level: 'method',
        statement:
          'No test pins the tote bag price to an announced value: the only expectation that involves it was edited in the same commit to follow the new price, so the suite passes with any price.',
        evidence: 'test/cart.test.js:7 and src/catalog.js:5, both changed by this commit',
      },
      {
        level: 'intent',
        statement:
          'The commit does not say why 1500 cents was wrong or where 1600 cents comes from, and it reached the branch without a pull request or a linked issue.',
        evidence: "commit message 'fix: correct the tote bag price'; the change description records no pull request for the commit",
      },
    ],
    proposedFix:
      'Add a test that states the tote bag price from the current price list, record the source of the correction in the commit body or a linked issue, and have the merchandising owner confirm that $16.00 is the intended price before the next production release.',
  },
};

export const NODE_24: StoryOutsideChange = {
  key: 'node-24',
  author: DEPENDENCY_BOT,
  message: 'build: run the checks on Node 24',
  files: [PACKAGE_FOR_NODE_24],
  branch: 'dependency-bot/node-24',
  verdict: null,
};
