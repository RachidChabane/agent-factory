import type { FixtureClock } from './time.ts';
import { MODEL_OPUS, MODEL_SONNET } from './people.ts';
import { contentOf } from './patch.ts';
import { ScriptBuilder, type ScriptStep } from './script-builder.ts';
import {
  PROMO_SAVINGS_ASSERTION_LINE,
  PROMO_SAVINGS_CHECK_FILES,
  PROMO_SAVINGS_TEST_LINE,
  PROMO_SAVINGS_TEST_NAME,
  STATUS_FILTER_CHECK_FILES,
} from './storefront/diffs-wip.ts';
import { MONEY_EXCERPT, ORDERS_PAGE_EXCERPT } from './storefront/excerpts.ts';
import { PROMO_SAVINGS_FINDING, PROMO_SAVINGS_QUESTION } from './storefront/decisions.ts';
import { CHECK_PATH } from './storefront/paths.ts';

const FIVE_HOUR_WINDOW_HOURS = 2.2;
const SEVEN_DAY_WINDOW_HOURS = 70;

function missing(): never {
  throw new Error('a frozen check of the live sessions is missing');
}

function rateLimit(builder: ScriptBuilder, clock: FixtureClock): ScriptBuilder {
  return builder.rateLimit([
    { window: 'five_hour', utilization: 0.42, resetsAt: clock.inHours(FIVE_HOUR_WINDOW_HOURS) },
    { window: 'seven_day', utilization: 0.63, resetsAt: clock.inHours(SEVEN_DAY_WINDOW_HOURS) },
  ]);
}

function initLine(sessionId: string, model: string, workspace: string): Readonly<Record<string, unknown>> {
  return { type: 'system', subtype: 'init', session_id: sessionId, model, cwd: workspace, tools: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Task', 'Write'] };
}

function hookLine(subtype: string, hookName: string, hookEvent: string): Readonly<Record<string, unknown>> {
  return { type: 'system', subtype, hook_name: hookName, hook_event: hookEvent };
}

/** The session of the implementer of the order history status filter. */
export function statusFilterImplementer(runId: string, clock: FixtureClock): readonly ScriptStep[] {
  const builder = new ScriptBuilder(runId, MODEL_SONNET);
  builder
    .session()
    .raw(initLine(`${runId}-session`, MODEL_SONNET, '/work/storefront/slot-2'))
    .say('I will start from the two frozen journeys of #45, then look at how the order history page loads and renders its rows before I change anything.');
  rateLimit(builder, clock)
    .raw(hookLine('hook_started', 'PreToolUse:Read', 'PreToolUse'))
    .tool('Read', { file_path: CHECK_PATH.statusFilter }, contentOf(STATUS_FILTER_CHECK_FILES[0] ?? missing()))
    .tool('Read', { file_path: CHECK_PATH.statusFilterEmpty }, contentOf(STATUS_FILTER_CHECK_FILES[1] ?? missing()))
    .tool(
      'Grep',
      { pattern: 'useOrders', path: 'web/src' },
      'web/src/hooks/useOrders.ts:7\nweb/src/pages/orders/index.tsx:9\nweb/src/components/history/OrderList.tsx:14',
    )
    .tool('Read', { file_path: 'web/src/pages/orders/index.tsx' }, ORDERS_PAGE_EXCERPT)
    .say(
      'The page reads everything through useOrders and the frozen journeys want the choice in the address bar. Two things to settle before editing: what the orders endpoint accepts, and which select the design system provides. I will have both explored in parallel.',
    )
    .progress();
  const endpoint = builder.call('Task', {
    description: 'Map how the orders endpoint reads its query parameters',
    subagent_type: 'Explore',
    prompt: 'Find how GET /api/orders reads limit, cursor and any filter, and what it returns for each order.',
  });
  const select = builder.call(
    'Task',
    {
      description: 'Find the select component the design system provides',
      subagent_type: 'Explore',
      prompt: 'Find the select or dropdown component of web/src/design, its props and how other pages label it.',
    },
    null,
    true,
  );
  builder
    .tool('Grep', { pattern: 'query', path: 'api/src/routes/orders' }, 'api/src/routes/orders/index.get.ts:12:  const { limit, cursor } = getQuery(request);', { parent: endpoint })
    .tool(
      'Read',
      { file_path: 'api/src/routes/orders/index.get.ts' },
      [
        'export default defineRoute(async (request) => {',
        '  const customer = await requireCustomer(request);',
        '  const { limit, cursor } = getQuery(request);',
        '  return listOrders(customer.id, { limit: Number(limit ?? DEFAULT_PAGE_SIZE), cursor });',
        '});',
      ].join('\n'),
      { parent: endpoint },
    )
    .say('The route reads limit and cursor only; each order already carries its status, so a status parameter is a small addition on the server side.', { parent: endpoint })
    .raw(hookLine('hook_started', 'PreToolUse:Grep', 'PreToolUse'))
    .tool('Grep', { pattern: 'export function Select', path: 'web/src/design' }, 'web/src/design/Select.tsx:11:export function Select({ label, options, value, onChange }: SelectProps) {', {
      parent: select,
    })
    .progress();
  builder.call('Read', { file_path: 'web/src/design/Select.tsx' }, select);
  return builder.build();
}

/** The fresh session of the implementer of the promo savings issue, which asks the operator for a decision. */
export function promoSavingsDecision(runId: string): readonly ScriptStep[] {
  const builder = new ScriptBuilder(runId, MODEL_OPUS);
  builder
    .session()
    .raw(initLine(`${runId}-session`, MODEL_OPUS, '/work/storefront/slot-1'))
    .say(
      `New session, started from a summary of the three earlier attempts: they all stopped on the same assertion of the frozen journey ${CHECK_PATH.promoSavings}. I will read that assertion before changing any code.`,
    )
    .tool('Read', { file_path: CHECK_PATH.promoSavings }, contentOf(PROMO_SAVINGS_CHECK_FILES[0] ?? missing()))
    .tool('Grep', { pattern: 'formatMoney', path: 'web/src' }, 'web/src/cart/CartSummary.tsx:18\nweb/src/lib/money.ts:5\nweb/src/lib/money.test.ts:9')
    .tool('Read', { file_path: 'web/src/lib/money.ts' }, MONEY_EXCERPT)
    .say(
      'The spec says the saving is shown in the shop currency, and formatMoney does exactly that: on the French shop the amount is 4,20 € while the journey expects "-$4.20". Running the journey to see which one wins.',
    )
    .tool(
      'Bash',
      { command: `pnpm --filter web exec playwright test ${CHECK_PATH.promoSavings}` },
      [
        `  1) ${CHECK_PATH.promoSavings}:${PROMO_SAVINGS_TEST_LINE}:1 › ${PROMO_SAVINGS_TEST_NAME}`,
        '',
        '    Error: expect(locator).toHaveText(expected) failed',
        '    Locator: getByTestId(\'promo-savings\')',
        '    Expected string: "-$4.20"',
        '    Received string: "-4,20 €"',
        '',
        '  1 failed (6.1s)',
      ].join('\n'),
      { isError: true, long: true },
    )
    .tool(
      'Write',
      { file_path: '.factory/decision-request.md' },
      'File created: .factory/decision-request.md',
    )
    .gate([
      { name: 'frozen-checks', outcome: 'passed', detail: 'passed' },
      { name: 'lint', outcome: 'passed', detail: 'passed' },
      { name: 'typecheck', outcome: 'passed', detail: 'passed' },
      { name: 'acceptance', outcome: 'failed', detail: `${CHECK_PATH.promoSavings}:${PROMO_SAVINGS_ASSERTION_LINE} expected "-$4.20", received "-4,20 €"` },
      { name: 'unit-tests', outcome: 'skipped', detail: 'skipped because an earlier step failed' },
      { name: 'build', outcome: 'skipped', detail: 'skipped because an earlier step failed' },
    ])
    .hook('Stop', 0, 'Decision requested: the run stops here and waits for the operator.')
    .say(`${PROMO_SAVINGS_FINDING}\n\n${PROMO_SAVINGS_QUESTION}`, { usage: 'before' });
  return builder.build();
}
