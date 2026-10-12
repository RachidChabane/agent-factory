import type { GateStepView, RunLogEvent, TokenUsageView } from '../../contract/index.ts';

export interface ScriptStep {
  readonly delayMs: number;
  readonly event: RunLogEvent;
}

export interface ScriptSubject {
  readonly number: number;
  readonly title: string;
  readonly slug: string;
  readonly checkPath: string;
}

const QUICK_MS = 900;
const THINK_MS = 2600;
const TOOL_MS = 1700;
const LONG_TOOL_MS = 5200;

class ScriptBuilder {
  private readonly steps: ScriptStep[] = [];
  private toolCounter = 0;
  private readonly prefix: string;
  private usage: TokenUsageView = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  private costUsd = 0;
  private turns = 0;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  session(model: string): this {
    this.steps.push({ delayMs: QUICK_MS, event: { kind: 'session-started', sessionId: `${this.prefix}-session`, model } });
    return this;
  }

  say(text: string, parentToolUseId: string | null = null, delayMs = THINK_MS): this {
    this.steps.push({ delayMs, event: { kind: 'assistant-text', text, parentToolUseId } });
    return this.turn();
  }

  tool(toolName: string, input: unknown, result: string, options: { isError?: boolean; parent?: string | null; durationMs?: number } = {}): this {
    const toolUseId = this.nextToolId();
    this.steps.push({
      delayMs: QUICK_MS,
      event: { kind: 'tool-call', toolUseId, toolName, input, parentToolUseId: options.parent ?? null },
    });
    this.steps.push({
      delayMs: options.durationMs ?? TOOL_MS,
      event: { kind: 'tool-result', toolUseId, isError: options.isError ?? false, content: result },
    });
    return this;
  }

  subagent(description: string, agentType: string, body: (parent: string, builder: this) => void, result: string): this {
    const toolUseId = this.nextToolId();
    this.steps.push({
      delayMs: QUICK_MS,
      event: {
        kind: 'tool-call',
        toolUseId,
        toolName: 'Task',
        input: { description, subagent_type: agentType, prompt: description },
        parentToolUseId: null,
      },
    });
    body(toolUseId, this);
    this.steps.push({ delayMs: TOOL_MS, event: { kind: 'tool-result', toolUseId, isError: false, content: result } });
    return this.turn();
  }

  hook(hookEvent: string, exitCode: number | null, output: string): this {
    this.steps.push({ delayMs: QUICK_MS, event: { kind: 'hook', hookEvent, exitCode, output } });
    return this;
  }

  gate(steps: readonly GateStepView[]): this {
    const passed = steps.every((step) => step.outcome !== 'failed');
    this.steps.push({ delayMs: LONG_TOOL_MS, event: { kind: 'gate', passed, steps: [...steps] } });
    return this;
  }

  build(): readonly ScriptStep[] {
    return this.steps;
  }

  private nextToolId(): string {
    this.toolCounter += 1;
    return `${this.prefix}-tool-${this.toolCounter}`;
  }

  private turn(): this {
    this.turns += 1;
    const input = 2_800 + this.turns * 410;
    const output = 220 + ((this.turns * 97) % 380);
    this.usage = {
      inputTokens: this.usage.inputTokens + input,
      outputTokens: this.usage.outputTokens + output,
      cacheReadTokens: this.usage.cacheReadTokens + input * 6,
      cacheCreationTokens: this.usage.cacheCreationTokens + Math.round(input / 3),
    };
    this.costUsd = Math.round((this.costUsd + input * 0.000003 + output * 0.000015 + input * 6 * 0.0000003) * 10_000) / 10_000;
    this.steps.push({ delayMs: 120, event: { kind: 'usage', usage: this.usage, costUsd: this.costUsd, turns: this.turns } });
    return this;
  }
}

function pascalCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function gateSteps(failing: string | null, ruleViolationPath: string): readonly GateStepView[] {
  const step = (name: string, detail: string): GateStepView =>
    failing === name ? { name, outcome: 'failed', detail } : { name, outcome: 'passed', detail: 'ok' };
  return [
    step('frozen-checks', 'hashes match'),
    step('acceptance-checks', 'the playwright journey failed'),
    step('lint', 'eslint found errors'),
    step('typecheck', 'tsc reported errors'),
    step('tests', 'vitest reported failing tests'),
    step('repository-rules', `${ruleViolationPath}:3 contains a code comment (repository rules: do not add comments to code)`),
  ];
}

export function implementerScript(subject: ScriptSubject, model: string): readonly ScriptStep[] {
  const hookPath = `web/src/hooks/use${pascalCase(subject.slug)}.ts`;
  const unitTest = `web/test/unit/${subject.slug}.test.ts`;
  return new ScriptBuilder(`impl-${subject.number}`)
    .session(model)
    .say(`I'll start with the frozen acceptance checks for #${subject.number}, then trace how the order history list loads its data before changing anything.`)
    .tool(
      'Read',
      { file_path: subject.checkPath },
      `import { test, expect } from '@playwright/test'\n\ntest('${subject.title}', async ({ page }) => {\n  await page.goto('/orders')\n  await expect(page.getByTestId('${subject.slug}')).toBeVisible()\n  ...`,
    )
    .tool('Read', { file_path: 'web/src/pages/orders/index.tsx' }, 'export function OrdersPage() {\n  const { orders, pending } = useOrders()\n  ...\n}')
    .tool('Grep', { pattern: 'useOrders', path: 'web/src' }, 'web/src/hooks/useOrders.ts:7\nweb/src/pages/orders/index.tsx:3\nweb/src/components/history/OrderList.tsx:12')
    .subagent(
      'Map how the order history list loads its data',
      'Explore',
      (parent, builder) => {
        builder
          .tool('Grep', { pattern: 'defineRoute', path: 'api/src/routes/orders' }, 'api/src/routes/orders/index.get.ts:4', { parent })
          .tool(
            'Read',
            { file_path: 'api/src/routes/orders/index.get.ts' },
            'export default defineRoute(async (request) => {\n  const customer = await requireCustomer(request)\n  return listOrders(customer.id)\n})',
            { parent },
          )
          .say('GET /api/orders returns number, date, status and totals for the signed-in customer; every order already carries its `status`.', parent, QUICK_MS);
      },
      'The history list reads GET /api/orders (number, date, status, totals). Orders expose their status, so filtering can stay client-side for the current page and server-side via ?status= for pagination.',
    )
    .say("The API already returns the status of each order. I'll add a hook that keeps the selection in the route query and pass it to the list endpoint.")
    .tool('Write', { file_path: hookPath }, `File created: ${hookPath}`)
    .tool('Edit', { file_path: 'web/src/pages/orders/index.tsx' }, 'Edited web/src/pages/orders/index.tsx (+18 −3)')
    .tool('Edit', { file_path: 'api/src/routes/orders/index.get.ts' }, 'Edited api/src/routes/orders/index.get.ts (+6 −1)')
    .tool('Bash', { command: 'pnpm --filter web exec vitest run test/unit' }, ` ✓ ${unitTest} (4 tests) 38ms\n\n Test Files  1 passed (1)\n      Tests  4 passed (4)`, {
      durationMs: LONG_TOOL_MS,
    })
    .say('Unit tests are green. Now running the frozen Playwright journey.')
    .tool(
      'Bash',
      { command: `pnpm --filter web exec playwright test ${subject.checkPath}` },
      `  1) ${subject.checkPath}:3:1 › ${subject.title}\n\n    Error: expect(locator).toBeVisible() failed\n    Locator: getByTestId('${subject.slug}')\n    Expected: visible\n    Received: <element(s) not found>\n\n  1 failed (7.4s)`,
      { isError: true, durationMs: LONG_TOOL_MS * 1.6 },
    )
    .say(`The journey looks the element up by its test id. My markup has none; I'll add data-testid="${subject.slug}" to the list container, as the repository rules ask for stable test ids.`)
    .tool('Edit', { file_path: 'web/src/pages/orders/index.tsx' }, 'Edited web/src/pages/orders/index.tsx (+4 −6)')
    .tool('Edit', { file_path: 'web/src/components/history/OrderList.tsx' }, 'Edited web/src/components/history/OrderList.tsx (+1 −0)')
    .tool('Bash', { command: `pnpm --filter web exec playwright test ${subject.checkPath}` }, `  ✓ 1 ${subject.checkPath}:3:1 › ${subject.title} (5.6s)\n\n  1 passed (6.5s)`, {
      durationMs: LONG_TOOL_MS * 1.4,
    })
    .tool('Bash', { command: 'mise run lint' }, '✔ eslint (0 problems)\n✔ tsc', { durationMs: LONG_TOOL_MS })
    .say('The journey, the unit tests and the lint all pass locally. Wrapping up the session.')
    .gate(gateSteps('repository-rules', hookPath))
    .hook('Stop', 2, `Completion gate failed: repository-rules — ${hookPath}:3 contains a code comment (repository rules: do not add comments to code). Fix it before finishing.`)
    .say('The gate refuses the comment I left in the hook. Removing it; the reason belongs in the pull request description.')
    .tool('Edit', { file_path: hookPath }, `Edited ${hookPath} (+0 −1)`)
    .gate(gateSteps(null, hookPath))
    .hook('Stop', 0, 'Completion gate passed (6 of 6 steps).')
    .say(`All done: #${subject.number} (${subject.title}) is implemented. The frozen checks and the unit tests pass, and the gate is green.`)
    .build();
}

export function acceptanceAuthorScript(subject: ScriptSubject, model: string): readonly ScriptStep[] {
  return new ScriptBuilder(`checks-${subject.number}`)
    .session(model)
    .say(`Writing the acceptance checks for #${subject.number} from its criteria: one observable assertion per criterion.`)
    .tool('Read', { file_path: 'api/src/db/migrations' }, '0041_order_discounts.sql\n0042_order_labels.sql')
    .tool(
      'Read',
      { file_path: 'api/src/db/schema.ts' },
      'export const orderLines = pgTable("order_lines", {\n  id: uuid("id").primaryKey(),\n  orderId: uuid("order_id"),\n  name: text("name"),\n  ...',
    )
    .say('The migration test will run against a copy of the production database and assert the index, the stemming and the duration budget.')
    .tool('Write', { file_path: subject.checkPath }, `File created: ${subject.checkPath}`)
    .tool(
      'Bash',
      { command: `pnpm --filter api exec vitest run ${subject.checkPath}` },
      ` FAIL  ${subject.checkPath}\n  × index order_lines_name_fts exists\n    expected undefined to be defined\n  × "drill" matches "drills"\n    expected [] to have length 3\n\n Tests  2 failed | 1 passed (3)`,
      { isError: true, durationMs: LONG_TOOL_MS * 2 },
    )
    .say('On the base branch the checks fail for the expected reasons: there is no index and no stemming. The duration assertion passes trivially on base and will guard the migration once frozen. Ready to freeze.')
    .build();
}

export function reviewerScript(subject: ScriptSubject, model: string): readonly ScriptStep[] {
  return new ScriptBuilder(`review-${subject.number}`)
    .session(model)
    .say(`Reviewing the diff of #${subject.number} against its spec and its frozen checks. Another session wrote this change.`)
    .tool('Read', { file_path: 'diff.patch' }, '6 files changed, 118 insertions(+), 14 deletions(-)')
    .tool(
      'Grep',
      { pattern: 'limit', path: 'api/src/routes/orders/index.get.ts' },
      '12:  const limit = getQuery(request).limit\n13:  if (limit !== undefined) query.limit(Math.min(Number(limit), MAX_PAGE_SIZE))',
    )
    .say('Criteria 1–3 are covered by the integration test and the cursor logic. A `limit` above the cap is refused with HTTP 400 and a malformed cursor is rejected. No scope creep, checks untouched.')
    .say(
      '```json\n{ "findings": [ { "severity": "non-blocking", "category": "correctness", "file": "api/src/routes/orders/index.get.ts", "line": 12, "summary": "limit query parameter is not validated as an integer; malformed values reach the database driver" } ] }\n```',
    )
    .build();
}

export function challengerScript(requestId: string, model: string): readonly ScriptStep[] {
  return new ScriptBuilder(`challenge-${requestId}`)
    .session(model)
    .say(`Reading request ${requestId} and the knowledge pack before judging each item.`)
    .tool('Grep', { pattern: 'order', path: 'web/src/pages' }, 'web/src/pages/orders/[id].tsx\nweb/src/pages/orders/index.tsx')
    .tool('Read', { file_path: 'web/src/pages/orders/[id].tsx' }, '<main>\n  <OrderTimeline order={order} />\n  <Button onClick={share}>Share</Button>\n</main>')
    .say('The request touches the order pages. Two items stand out: reordering (keep, the order page has no reorder action) and sharing an order by link (ask: the audience of the link changes the security required).')
    .say(
      '```json\n{ "items": [ { "title": "Reorder an order in one click", "verdict": "keep", "reason": "no reorder action exists and the cost is low", "question": null }, { "title": "Share an order with a link", "verdict": "ask", "reason": "the audience of the link changes the security required", "question": "Will the recipients all have a Storefront account?" } ], "specs": [], "reply": "" }\n```',
    )
    .build();
}

export function answerContinuationScript(runPrefix: string, answer: string): readonly ScriptStep[] {
  return new ScriptBuilder(runPrefix)
    .say(`Answer received from the operator: “${answer}”. Waiting for the rewritten check before the implementation resumes.`, null, QUICK_MS)
    .hook('Stop', 0, 'Run paused until the frozen check has been rewritten.')
    .build();
}
