import { expect } from '@playwright/test';

const AGREEMENT_TIMEOUT_MS = 30_000;
const RETRY_INTERVALS_MS = [250, 500, 1_000];

/** How long one look at the page may take inside `untilPageAgreesWithFactory`; a retry is cheaper than a long wait. */
export const ONE_LOOK = { timeout: 2_000 } as const;

/**
 * Repeats an assertion that compares the page with the factory's state until both agree. The factory may
 * start a run, or finish one, between the moment the state is read and the moment the page is read.
 */
export async function untilPageAgreesWithFactory(assertion: () => Promise<void>): Promise<void> {
  await expect(assertion).toPass({ timeout: AGREEMENT_TIMEOUT_MS, intervals: RETRY_INTERVALS_MS });
}
