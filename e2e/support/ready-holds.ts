import type { FilmToolWaitView, ReadyHoldView } from '../../packages/cockpit/src/contract/index.ts';
import type { I18n } from '../../packages/cockpit/src/i18n/create-i18n.ts';

const LIST_SEPARATOR = ', ';

function namesOf(hold: ReadyHoldView): readonly string[] {
  return 'scenarios' in hold ? hold.scenarios : hold.checks;
}

/**
 * What the ready notice says of one hold, in a language: each check or scenario it names, that no check is known when none
 * is, and the tool the queued films wait for when one does.
 */
export function holdWords(hold: ReadyHoldView, words: I18n, wait: FilmToolWaitView | null = null): string {
  const names = namesOf(hold);
  const named = { count: names.length };
  const list = names.join(LIST_SEPARATOR);
  switch (hold.kind) {
    case 'checks-running':
      return names.length === 0 ? words.t('pullRequests.ready.hold.checks-unreported') : words.t('pullRequests.ready.hold.checks-running', { ...named, checks: list });
    case 'checks-failed':
      return words.t('pullRequests.ready.hold.checks-failed', { ...named, checks: list });
    case 'films-pending':
      return wait === null
        ? words.t('pullRequests.ready.hold.films-pending', { ...named, scenarios: list })
        : words.t('pullRequests.ready.hold.films-waiting', { ...named, scenarios: list, tool: wait.tool });
    case 'films-failed':
      return words.t('pullRequests.ready.hold.films-failed', { ...named, scenarios: list });
  }
}
