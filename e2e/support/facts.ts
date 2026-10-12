import type { Locator } from '@playwright/test';

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(REGEXP_SPECIALS, '\\$&')}$`);
}

/** The value written next to a label in a list of facts, found by the exact text of the label. */
export function factValue(scope: Locator, label: string): Locator {
  return scope.getByRole('term').filter({ hasText: exactly(label) }).locator('xpath=following-sibling::*[1]');
}
