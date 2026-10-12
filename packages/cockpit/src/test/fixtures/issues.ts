import type { IssueState, IssueType } from '@agent-factory/domain';
import { beforeProofKind } from '@agent-factory/domain';
import type { AcceptanceCheck, Attempt, IssueSpecView, IssueView } from '../../contract/index.ts';
import { historyBeforeImage } from './evidence.ts';
import type { FixtureClock } from './time.ts';
import { issueUrl } from './time.ts';

interface IssueSeed {
  readonly number: number;
  readonly title: string;
  readonly type: IssueType;
  readonly state: IssueState;
  readonly spec: IssueSpecView;
  readonly dependsOn?: readonly number[] | undefined;
  readonly requestId?: string | undefined;
  readonly slug: string;
  readonly pullRequestNumber?: number | undefined;
  readonly checks?: readonly AcceptanceCheck[] | undefined;
  readonly frozenHoursAgo?: number | undefined;
  readonly attempts?: readonly Attempt[] | undefined;
  readonly createdHoursAgo: number;
  readonly updatedMinutesAgo: number;
  readonly hasBranch?: boolean | undefined;
}

const PRE_BRANCH_STATES: readonly IssueState[] = ['spec-draft', 'spec-validated', 'blocked'];

const SHA_HEX_LENGTH = 64;

function sha(seed: number): string {
  let state = (seed * 2654435761) >>> 0 || 1;
  let out = '';
  while (out.length < SHA_HEX_LENGTH) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out += state.toString(16).padStart(8, '0');
  }
  return out.slice(0, SHA_HEX_LENGTH);
}

function playwrightCheck(path: string, seed: number, frozen: boolean): AcceptanceCheck {
  return {
    path,
    kind: 'playwright',
    sha256: frozen ? sha(seed) : null,
    onBase: 'fails',
    before: frozen
      ? {
          result: 'failed',
          detail: 'The locator should be visible, but the element does not exist on the base branch.',
          score: null,
          screenshotUrl: historyBeforeImage(),
        }
      : { result: 'not-run', detail: '', score: null, screenshotUrl: null },
  };
}

function testCheck(path: string, kind: 'unit' | 'integration' | 'migration' | 'policy', seed: number, frozen: boolean, detail: string): AcceptanceCheck {
  return {
    path,
    kind,
    sha256: frozen ? sha(seed) : null,
    onBase: 'fails',
    before: frozen ? { result: 'failed', detail, score: null, screenshotUrl: null } : { result: 'not-run', detail: '', score: null, screenshotUrl: null },
  };
}

function seedToIssue(seed: IssueSeed, clock: FixtureClock): IssueView {
  const hasBranch = seed.hasBranch ?? !PRE_BRANCH_STATES.includes(seed.state);
  return {
    number: seed.number,
    title: seed.title,
    type: seed.type,
    state: seed.state,
    resumeTarget: null,
    paused: false,
    spec: seed.spec,
    dependsOn: [...(seed.dependsOn ?? [])],
    requestId: seed.requestId ?? null,
    branch: hasBranch ? `factory/${seed.number}-${seed.slug}` : null,
    pullRequestNumber: seed.pullRequestNumber ?? null,
    beforeProofKind: beforeProofKind(seed.type),
    checks: [...(seed.checks ?? [])],
    checksFrozenAt: seed.frozenHoursAgo === undefined ? null : clock.hoursAgo(seed.frozenHoursAgo),
    attempts: [...(seed.attempts ?? [])],
    escalation: null,
    createdAt: clock.hoursAgo(seed.createdHoursAgo),
    updatedAt: clock.minutesAgo(seed.updatedMinutesAgo),
    url: issueUrl(seed.number),
  };
}

function attempt(
  clock: FixtureClock,
  index: number,
  kind: Attempt['kind'],
  runId: string,
  outcome: Attempt['outcome'],
  startedMinutesAgo: number,
  durationMinutes: number | null,
  summary: string,
  model = 'claude-opus-5-5',
  effort: Attempt['effort'] = 'high',
): Attempt {
  return {
    index,
    kind,
    runId,
    model,
    effort,
    startedAt: clock.minutesAgo(startedMinutesAgo),
    endedAt: durationMinutes === null ? null : clock.minutesAgo(startedMinutesAgo - durationMinutes),
    outcome,
    summary,
  };
}

export function buildIssues(clock: FixtureClock): IssueView[] {
  const seeds: IssueSeed[] = [
    {
      number: 232,
      title: 'Send checkout step latency to the monitoring dashboard',
      type: 'infra-ci',
      state: 'spec-draft',
      slug: 'checkout-latency-metrics',
      requestId: 'R-20',
      dependsOn: [231],
      createdHoursAgo: 1,
      updatedMinutesAgo: 63,
      spec: {
        need: 'The platform team cannot tell which checkout step slows a payment down.',
        acceptanceCriteria: [
          'Every checkout step emits a `storefront.checkout.step.duration` metric tagged with step and payment provider.',
          'A monitor alerts when the p95 of any step exceeds 5 seconds for 10 minutes.',
        ],
        outOfScope: ['Tracing of third-party payment calls', 'Additional dashboards'],
        expectedProof: 'Policy check of the monitor definition and a dry run of the deployment.',
      },
    },
    {
      number: 231,
      title: 'Show the payment provider and retry count on the order timeline',
      type: 'ui',
      state: 'spec-draft',
      slug: 'payment-retry-timeline',
      requestId: 'R-20',
      createdHoursAgo: 1,
      updatedMinutesAgo: 64,
      spec: {
        need: 'When a checkout is slow or fails, the platform team needs to see which provider handled each payment attempt and how many retries it took.',
        acceptanceCriteria: [
          'The order timeline shows the payment provider and the attempt count of every payment.',
          'Payments completed after a retry are marked with a "retried" badge.',
        ],
        outOfScope: ['Changing the payment provider from the timeline'],
        expectedProof: 'Playwright journey opening the timeline of a seeded order, before/after screenshots.',
      },
    },
    {
      number: 230,
      title: 'Full-text search index over order line names',
      type: 'data',
      state: 'authoring-checks',
      slug: 'order-lines-fulltext-index',
      requestId: 'R-16',
      createdHoursAgo: 70,
      updatedMinutesAgo: 9,
      spec: {
        need: 'Customers remember what they bought, not the order number.',
        acceptanceCriteria: [
          'A migration adds a full-text index over order line names.',
          'Searching "drill" returns the orders whose lines contain "drills".',
          'Running the migration on a copy of the production database takes less than 60 seconds.',
        ],
        outOfScope: ['Changes to the search interface', 'Relevance tuning'],
        expectedProof: 'Migration test run on a database copy, showing the new index and the expected search results.',
      },
      attempts: [],
    },
    {
      number: 229,
      title: 'Hide several orders from the history at once',
      type: 'ui',
      state: 'blocked',
      slug: 'history-bulk-hide',
      requestId: 'R-16',
      dependsOn: [227],
      createdHoursAgo: 70,
      updatedMinutesAgo: 180,
      spec: {
        need: 'Customers want to tidy their history quickly without hiding an order by mistake.',
        acceptanceCriteria: [
          'Selecting several orders shows an action bar with "Hide".',
          'Hidden orders disappear and an "Undo" toast restores them within 10 seconds.',
        ],
        outOfScope: ['Permanent deletion'],
        expectedProof: 'Playwright journey hiding then restoring two orders.',
      },
    },
    {
      number: 228,
      title: 'Label an order inline from the history list',
      type: 'ui',
      state: 'spec-validated',
      slug: 'history-inline-label',
      dependsOn: [221],
      createdHoursAgo: 30,
      updatedMinutesAgo: 95,
      spec: {
        need: 'Order numbers are not meaningful enough to recognise important orders.',
        acceptanceCriteria: [
          'Double-clicking an order label turns it into a text field; Enter saves, Escape cancels.',
          'A label longer than 60 characters is refused with an inline message.',
        ],
        outOfScope: ['Bulk labelling'],
        expectedProof: 'Playwright journey labelling an order.',
      },
    },
    {
      number: 227,
      title: 'Filter the order history by status',
      type: 'ui',
      state: 'implementing',
      slug: 'history-status-filter',
      requestId: 'R-16',
      dependsOn: [221],
      createdHoursAgo: 70,
      updatedMinutesAgo: 14,
      frozenHoursAgo: 0.4,
      checks: [
        playwrightCheck('e2e/history/status-filter.spec.ts', 227, true),
        testCheck('web/test/unit/history-status-filter.test.ts', 'unit', 2271, true, 'Cannot find module "@/hooks/useHistoryStatusFilter".'),
      ],
      attempts: [attempt(clock, 1, 'session', 'run_7f3a2c', 'running', 14, null, 'Implementation under way.')],
      spec: {
        need: 'Customers compare their orders by delivery progress and need to isolate the orders of one status.',
        acceptanceCriteria: [
          'The history list shows a "Status" filter listing the statuses present in the account.',
          'Choosing a status shows only its orders; the choice is kept in the URL.',
          'Clearing the filter shows every order again.',
        ],
        outOfScope: ['Filtering by several statuses at once', 'Stored filter presets'],
        expectedProof: 'Playwright journey filtering by status and reloading the page, before/after screenshots.',
      },
    },
    {
      number: 226,
      title: 'Paginate the order history endpoint with cursors',
      type: 'engine-api',
      state: 'producing-evidence',
      slug: 'history-cursor-pagination',
      createdHoursAgo: 52,
      updatedMinutesAgo: 3,
      frozenHoursAgo: 6,
      checks: [
        testCheck(
          'api/src/routes/orders/__tests__/pagination.test.ts',
          'integration',
          226,
          true,
          'expected 50 items and a next cursor, received 1240 items and no cursor',
        ),
      ],
      attempts: [
        attempt(clock, 1, 'session', 'run_3ac1f9', 'review-failed', 210, 48, 'The reviewer flagged a page size without an upper bound.'),
        attempt(clock, 2, 'correction', 'run_3ac1f9', 'passed', 150, 22, 'The page size is now capped at 100; the reviewer has no blocking finding.'),
      ],
      spec: {
        need: 'Accounts with thousands of orders wait several seconds for the history to load.',
        acceptanceCriteria: [
          'GET /api/orders returns at most 50 items and a `nextCursor` when more exist.',
          'Sending the `cursor` returns the next page, with no duplicate item.',
          'Requesting a `limit` above 100 returns HTTP 400.',
        ],
        outOfScope: ['Infinite scroll in the interface'],
        expectedProof: 'Integration test that fails on the base branch and passes on this branch.',
      },
    },
    {
      number: 225,
      title: 'Format savings badges in the storefront currency',
      type: 'ui',
      state: 'needs-human',
      slug: 'savings-currency',
      requestId: 'R-16',
      dependsOn: [223],
      createdHoursAgo: 70,
      updatedMinutesAgo: 21,
      frozenHoursAgo: 5,
      checks: [playwrightCheck('e2e/history/savings-currency.spec.ts', 225, true)],
      attempts: [
        attempt(clock, 1, 'session', 'run_5d0910', 'gate-failed', 260, 35, 'Frozen journey expects "$4.20"; the spec asks for the storefront currency (EUR).'),
        attempt(clock, 2, 'correction', 'run_5d0910', 'gate-failed', 222, 18, 'Still failing on the same assertion: the check hard-codes the dollar sign.'),
        attempt(clock, 3, 'correction', 'run_5d0910', 'gate-failed', 200, 15, 'The spec cannot be met without editing the frozen check.'),
        attempt(
          clock,
          4,
          'fresh-session',
          'run_5d0911',
          'gate-failed',
          120,
          null,
          'A stronger model confirms the contradiction and asks the operator to decide.',
          'claude-opus-5-5',
          'max',
        ),
      ],
      spec: {
        need: 'Customers of the French storefront see amounts in dollars, which confuses them.',
        acceptanceCriteria: [
          'Savings badges use the storefront currency (EUR for the French storefront) with locale number formatting.',
          'The tooltip shows the original USD amount under the converted amount.',
        ],
        outOfScope: ['Live exchange rates (one rate per day is enough)'],
        expectedProof: 'Playwright journey on the French storefront, before/after screenshots.',
      },
    },
    {
      number: 224,
      title: 'Expose discount totals on the order history endpoint',
      type: 'engine-api',
      state: 'ci',
      slug: 'order-discount-totals',
      requestId: 'R-16',
      pullRequestNumber: 312,
      createdHoursAgo: 70,
      updatedMinutesAgo: 6,
      frozenHoursAgo: 8,
      checks: [
        testCheck(
          'api/src/routes/orders/__tests__/discount-totals.test.ts',
          'integration',
          224,
          true,
          "expected property 'discountTotal' on every order, received undefined",
        ),
      ],
      attempts: [attempt(clock, 1, 'session', 'run_8be402', 'passed', 300, 41, 'Gate and review both passed in the first session.')],
      spec: {
        need: 'The history list needs the savings of each order without one request per order.',
        acceptanceCriteria: [
          'GET /api/orders returns `discountTotal` and `itemsTotal` for every order.',
          'The discount total includes the free-shipping discount.',
          'Orders without any discount keep their current response.',
        ],
        outOfScope: ['Currency formatting'],
        expectedProof: 'Integration test that fails on the base branch and passes on this branch.',
      },
    },
    {
      number: 223,
      title: 'Display the savings of each order in the history list',
      type: 'ui',
      state: 'ready-to-merge',
      slug: 'history-savings-badges',
      requestId: 'R-16',
      pullRequestNumber: 311,
      createdHoursAgo: 70,
      updatedMinutesAgo: 34,
      frozenHoursAgo: 20,
      checks: [playwrightCheck('e2e/history/savings-badge.spec.ts', 223, true)],
      attempts: [
        attempt(clock, 1, 'session', 'run_2b8817', 'review-failed', 1180, 52, 'Reviewer: tooltip missing for the free-shipping split.'),
        attempt(clock, 2, 'correction', 'run_2b8817', 'passed', 1110, 19, 'Tooltip lists the discount code and the free shipping.'),
      ],
      spec: {
        need: 'Customers want to see what each order saved them.',
        acceptanceCriteria: [
          'Each row of the history list shows the savings of the order in a badge.',
          'Hovering the badge shows the split between discount code and free shipping.',
          'Orders without savings data show an em dash.',
        ],
        outOfScope: ['Currency formatting (#225)'],
        expectedProof: 'Playwright journey, before and after screenshots, and a recording of the tooltip.',
      },
    },
    {
      number: 221,
      title: 'Make the product-brief skill state measurable specifications',
      type: 'skill-prompt',
      state: 'in-dev',
      slug: 'product-brief-specifications',
      pullRequestNumber: 309,
      createdHoursAgo: 96,
      updatedMinutesAgo: 1300,
      frozenHoursAgo: 80,
      checks: [
        {
          path: 'assistant/evals/product-brief/measurable-specifications.yaml',
          kind: 'evaluation',
          sha256: sha(221),
          onBase: null,
          before: { result: 'scored', detail: 'Average score over 8 cases, 5 replays each, on the base prompt.', score: 0.46, screenshotUrl: null },
        },
      ],
      attempts: [attempt(clock, 1, 'session', 'run_0c77aa', 'passed', 4600, 37, 'Gain of +0.31 on the targeted cases, no regression elsewhere.')],
      spec: {
        need: 'Generated product briefs state vague specifications ("powerful", "light") that shoppers cannot compare.',
        acceptanceCriteria: [
          'Briefs state at least one measurable specification with its unit.',
          'Targeted evaluation cases gain at least 0.10 while no other case loses more than 0.05.',
        ],
        outOfScope: ['Changing the layout of the brief template'],
        expectedProof: 'Evaluation scores before and after for the targeted and the untouched cases.',
      },
    },
    {
      number: 219,
      title: 'Show the delivery status in the order page header',
      type: 'ui',
      state: 'in-prep',
      slug: 'order-delivery-status',
      createdHoursAgo: 150,
      updatedMinutesAgo: 2600,
      frozenHoursAgo: 140,
      checks: [playwrightCheck('e2e/orders/delivery-status.spec.ts', 219, true)],
      attempts: [attempt(clock, 1, 'session', 'run_19ff03', 'passed', 8300, 28, 'Passed in the first session.')],
      spec: {
        need: 'Customers cannot tell whether their parcel has shipped without scrolling down to the timeline.',
        acceptanceCriteria: ['The order page header shows the delivery status and the estimated delivery date.'],
        outOfScope: ['Carrier tracking details'],
        expectedProof: 'Playwright journey with screenshots.',
      },
    },
    {
      number: 218,
      title: 'Keep the cart when the customer signs in',
      type: 'ui',
      state: 'in-prod',
      slug: 'cart-merge-on-sign-in',
      dependsOn: [217],
      createdHoursAgo: 200,
      updatedMinutesAgo: 7000,
      frozenHoursAgo: 190,
      checks: [playwrightCheck('e2e/cart/merge-on-sign-in.spec.ts', 218, true)],
      attempts: [attempt(clock, 1, 'session', 'run_aa0218', 'passed', 11000, 31, 'Passed in the first session.')],
      spec: {
        need: 'Customers lose the cart they filled as a guest when they sign in at checkout.',
        acceptanceCriteria: ['The guest cart is merged into the cart of the account when the customer signs in.'],
        outOfScope: ['Merging carts across devices'],
        expectedProof: 'Playwright journey with screenshots.',
      },
    },
    {
      number: 217,
      title: 'Persist the cart on the server for signed-in customers',
      type: 'engine-api',
      state: 'closed',
      slug: 'server-side-cart',
      createdHoursAgo: 220,
      updatedMinutesAgo: 8200,
      frozenHoursAgo: 210,
      checks: [testCheck('api/src/cart/__tests__/persist-cart.test.ts', 'unit', 217, true, 'AssertionError: cart restored with 0 lines, expected 2')],
      attempts: [attempt(clock, 1, 'session', 'run_aa0217', 'passed', 12500, 44, 'Passed in the first session.')],
      spec: {
        need: 'A signed-in customer who changes device finds an empty cart.',
        acceptanceCriteria: ['The cart of a signed-in customer is stored on the server and restored on the next session.'],
        outOfScope: ['Offline carts'],
        expectedProof: 'Unit test that fails on the base branch and passes on this branch.',
      },
    },
  ];
  const issues = seeds.map((seed) => seedToIssue(seed, clock));
  return issues.map((issue) =>
    issue.number === 225
      ? {
          ...issue,
          resumeTarget: 'implementing',
          escalation: {
            reason: 'Frozen check contradicts the spec: e2e/history/savings-currency.spec.ts asserts "$4.20" while the spec requires the storefront currency.',
            diagnosis:
              'Four attempts failed on the same assertion. The journey hard-codes the dollar sign at line 27; any implementation satisfying the spec fails the check. Rewriting the assertion to expect "4,20 €" for the French storefront resolves the contradiction.',
            since: clock.minutesAgo(21),
          },
        }
      : issue,
  );
}
