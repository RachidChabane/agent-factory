import type { Blocker } from './blocker.ts';
import type { BlockerTransition, TransitionKind } from './blocker-transitions.ts';

const FACTORY_SCOPE = 'factory';
const SECONDS_END = 19;
const UTC_MARK = 'Z';

/** The words a line uses for each transition. */
export const TRANSITION_WORDS: Readonly<Record<TransitionKind, string>> = { appeared: 'blocked', cleared: 'cleared' };

/** Where a blocker is: `storefront#12` for an issue, `storefront` for a project, `factory` for the whole factory. */
export function whereOf(blocker: Blocker): string {
  if (blocker.project === null) return FACTORY_SCOPE;
  return blocker.issue === null ? blocker.project : `${blocker.project}#${blocker.issue}`;
}

/** The time of a reading as a line starts with it: UTC, to the second. */
export function readingTimeText(at: Date): string {
  return `${at.toISOString().slice(0, SECONDS_END)}${UTC_MARK}`;
}

/** `<time> <blocked|cleared> <kind> <where>[: <detail>]`; a cleared blocker's line names it without repeating why. */
export function transitionLine(at: Date, transition: BlockerTransition): string {
  const { kind, blocker } = transition;
  const head = `${readingTimeText(at)} ${TRANSITION_WORDS[kind]} ${blocker.kind} ${whereOf(blocker)}`;
  return kind === 'appeared' ? `${head}: ${blocker.detail}` : head;
}

/** The same transition as one JSON object on one line. */
export function transitionJson(at: Date, transition: BlockerTransition): string {
  const { kind, blocker } = transition;
  return JSON.stringify({
    at: at.toISOString(),
    transition: TRANSITION_WORDS[kind],
    kind: blocker.kind,
    project: blocker.project,
    issue: blocker.issue,
    key: blocker.key,
    detail: blocker.detail,
  });
}
