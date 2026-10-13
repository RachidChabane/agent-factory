import { expect, type Locator } from '@playwright/test';
import type { DelegatedDecisionView } from '../../packages/cockpit/src/contract/index.ts';
import { paths } from '../../packages/cockpit/src/model/routes.ts';
import { english } from './formats.ts';
import { wordsIn } from './words.ts';

const words = wordsIn('en');

/** One gesture of the delegate as the cockpit lists it: what it did, on what, who made it, why, under which rule, and when. */
export async function expectDecisionListed(item: Locator, project: string, decision: DelegatedDecisionView): Promise<void> {
  const { target } = decision;
  const link =
    target.kind === 'pull-request'
      ? { name: words.t('autonomy.decision.pullRequest', { number: target.number }), href: paths.pullRequest(project, target.number) }
      : { name: words.t('autonomy.decision.issue', { number: target.number }), href: paths.issue(project, target.number) };
  await expect(item).toContainText(words.t(`vocab.gesture.${decision.gesture}`));
  await expect(item.getByRole('link', { name: link.name })).toHaveAttribute('href', link.href);
  await expect(item).toContainText(words.t('autonomy.decision.by', { actor: decision.actor }));
  await expect(item).toContainText(words.t('autonomy.decision.reason', { reason: decision.reason }));
  await expect(item).toContainText(words.t('autonomy.decision.rule', { rule: decision.rule }));
  await expect(item.getByRole('time')).toHaveAttribute('datetime', decision.at);
  await expect(item.getByRole('time')).toHaveAttribute('title', english.absolute(decision.at));
}
