import type { CheckConclusion, CheckRunView } from '../contract/index.ts';

type BlameableCheck = Pick<CheckRunView, 'conclusion' | 'failsOnBase'>;

/** A failing check that fails the same way on the base branch: the change did not cause it, and it does not block the merge. */
export function failsOnBaseToo(check: BlameableCheck): boolean {
  return check.conclusion === 'failure' && check.failsOnBase;
}

/** The conclusion held against the change: a failure the base branch shares is held against nobody. */
export function blamedConclusion(check: BlameableCheck): CheckConclusion {
  return failsOnBaseToo(check) ? 'neutral' : check.conclusion;
}
