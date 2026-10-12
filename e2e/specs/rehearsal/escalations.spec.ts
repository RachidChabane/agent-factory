import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { issueOf, runsOfIssue } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS, AGENT_WORK_TIMEOUT_MS } from '../../support/factory-activity.ts';
import { firstOf } from '../../support/project-facts.ts';
import { DECISION_REQUESTS, REVIEW_BLOCKED_TITLE, REVIEW_REQUEST } from '../../support/rehearsal-scenario.ts';
import { acceptSpec, findRunOfIssue, receiveChallengedRequest, runOfIssue, settled, whileAgentsAreHeld } from '../../support/scenes.ts';
import { DISCOUNT_ROUNDING, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const ANSWER = 'Round the discount once on the subtotal, half up, and show that amount on the summary.';
const REWRITE_INSTRUCTION = 'The check must compare the discount of a cart with three lines to the amount the payment provider takes off.';
const ABANDON_REASON = 'The pricing review will decide the rounding rule, so this issue is not needed.';

interface Escalation {
  readonly issueNumber: number;
  readonly runId: string;
  readonly question: string;
}

test.describe('issues that wait for a human', () => {
  test.describe.configure({ mode: 'serial' });
  const escalations: Escalation[] = [];

  function escalation(position: number): Escalation {
    const found = escalations[position];
    if (found === undefined) throw new Error(`the scene holds no escalated issue at position ${position}`);
    return found;
  }

  test.beforeAll(async ({ factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    await settled(factory);
    for (const text of DECISION_REQUESTS) {
      const request = await receiveChallengedRequest(factory, text);
      const issueNumber = await acceptSpec(factory, request, DISCOUNT_ROUNDING.spec.title, true);
      const state = await factory.api.until(
        `issue #${issueNumber} to wait for a decision`,
        (snapshot) => issueOf(snapshot, STOREFRONT, issueNumber).state === 'needs-human' && (findRunOfIssue(snapshot, issueNumber, 'waiting')?.pendingQuestion ?? null) !== null,
        { timeoutMs: AGENT_WORK_TIMEOUT_MS },
      );
      const run = runOfIssue(state, issueNumber, 'waiting');
      escalations.push({ issueNumber, runId: run.id, question: run.pendingQuestion?.text ?? '' });
    }
  });

  test('answers the question of the run that waits for a decision', async ({ page, factory }) => {
    const { issueNumber, runId, question } = escalation(0);
    await openCockpit(page, factory, paths.run(runId));
    const panel = page.getByRole('region', { name: 'The agent is waiting for your answer' });
    await expect(panel).toContainText(question);
    await panel.getByRole('textbox', { name: 'Your answer' }).fill(ANSWER);

    const outcome = await clickCommand(page, 'run.answer', async () => {
      await panel.getByRole('button', { name: 'Send the answer', exact: true }).click();
    });
    expect(outcome.effect).toMatch(new RegExp(`^The answer is recorded and issue #${issueNumber} resumes at [a-z-]+; the daemon picks it up at its next tick$`));

    await factory.api.until(`issue #${issueNumber} to leave the people`, (state) => issueOf(state, STOREFRONT, issueNumber).state !== 'needs-human');
    await expect(panel).toBeHidden();
    await settled(factory);
  });

  test('orders the rewrite of a frozen check, which the checks author takes over', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    const { issueNumber } = escalation(1);
    const check = firstOf(issueOf(await factory.api.state(), STOREFRONT, issueNumber).checks.filter((candidate) => candidate.sha256 !== null), `frozen check of issue #${issueNumber}`);
    await whileAgentsAreHeld(factory, async () => {
      await openCockpit(page, factory, paths.issue(STOREFRONT, issueNumber));
      await page.getByRole('main').getByRole('button', { name: 'Rewrite a check', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Rewrite a frozen check' });
      await expect(dialog.getByRole('combobox', { name: 'Check' })).toHaveValue(check.path);
      await dialog.getByRole('textbox', { name: 'Instruction' }).fill(REWRITE_INSTRUCTION);

      const outcome = await clickCommand(page, 'issue.rewrite-check', async () => {
        await dialog.getByRole('button', { name: 'Ask for the rewrite', exact: true }).click();
      });
      expect(outcome.effect).toBe(`A rewrite of ${check.path} is ordered on issue #${issueNumber}; the daemon picks it up at its next tick`);
      await factory.api.until(`issue #${issueNumber} to rewrite its check`, (state) => issueOf(state, STOREFRONT, issueNumber).state === 'rewriting-check');
    });
    await factory.api.until(`issue #${issueNumber} to carry on after the rewrite`, (state) => issueOf(state, STOREFRONT, issueNumber).state !== 'rewriting-check', { timeoutMs: AGENT_WORK_TIMEOUT_MS });
    await settled(factory);
  });

  test('abandons an issue with the reason typed in its dialog', async ({ page, factory }) => {
    const { issueNumber } = escalation(2);
    await openCockpit(page, factory, paths.issue(STOREFRONT, issueNumber));
    await page.getByRole('main').getByRole('button', { name: 'Abandon', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Abandon #${issueNumber}?` });
    await dialog.getByRole('textbox', { name: 'Reason' }).fill(ABANDON_REASON);

    const outcome = await clickCommand(page, 'issue.abandon', async () => {
      await dialog.getByRole('button', { name: 'Abandon the issue', exact: true }).click();
    });
    expect(outcome.effect).toMatch(new RegExp(`^Issue #${issueNumber} abandoned`));

    await factory.api.until(`issue #${issueNumber} to be abandoned`, (state) => issueOf(state, STOREFRONT, issueNumber).state === 'abandoned');
    await expect(page.getByRole('region', { name: 'Abandoned' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Abandon', exact: true })).toHaveCount(0);
  });
});

test.describe('an issue whose review keeps blocking an implementation that passed its gate', () => {
  test('orders a new review of the same implementation, which runs again without a new implementer attempt', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    await settled(factory);
    const request = await receiveChallengedRequest(factory, REVIEW_REQUEST);
    const issueNumber = await acceptSpec(factory, request, REVIEW_BLOCKED_TITLE, true);
    const escalated = await factory.api.until(
      `issue #${issueNumber} to escalate on its review`,
      (state) => {
        const issue = issueOf(state, STOREFRONT, issueNumber);
        return issue.state === 'needs-human' && issue.resumeTarget === 'reviewing';
      },
      { timeoutMs: AGENT_WORK_TIMEOUT_MS },
    );
    const runsOf = (state: typeof escalated, role: 'reviewer' | 'implementer') => runsOfIssue(state, STOREFRONT, issueNumber).filter((run) => run.role === role).length;
    const reviews = runsOf(escalated, 'reviewer');
    const implementations = runsOf(escalated, 'implementer');

    await openCockpit(page, factory, paths.issue(STOREFRONT, issueNumber));
    const outcome = await clickCommand(page, 'issue.resume', async () => {
      await page.getByRole('main').getByRole('button', { name: 'Review again', exact: true }).click();
    });
    expect(outcome.effect).toMatch(new RegExp(`^Issue #${issueNumber} returned to reviewing; the implementation of attempt \\d+ is reviewed again`));

    const again = await factory.api.until(
      `the review of issue #${issueNumber} to run again`,
      (state) => issueOf(state, STOREFRONT, issueNumber).state === 'needs-human' && runsOf(state, 'reviewer') > reviews,
      { timeoutMs: AGENT_WORK_TIMEOUT_MS },
    );
    expect(runsOf(again, 'reviewer')).toBe(reviews + 1);
    expect(runsOf(again, 'implementer')).toBe(implementations);
    await settled(factory);
  });
});
