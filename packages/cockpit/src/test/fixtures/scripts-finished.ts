import type { FixtureClock } from './time.ts';
import { MODEL_OPUS, MODEL_SONNET } from './people.ts';
import { contentOf, fileAt } from './patch.ts';
import { ScriptBuilder, type ScriptStep } from './script-builder.ts';
import { createdLine, diffStat, editedLine, fenced, grepHit } from './script-lines.ts';
import { NATURAL_LANGUAGE_SEARCH_FILES } from './storefront/diffs-open.ts';
import { EXPIRED_PROMO_FILES } from './storefront/diffs-merged.ts';
import { CHECK_PATH } from './storefront/paths.ts';
import { REVIEW_FINDINGS } from './storefront/reviews.ts';

const FIVE_HOUR_WINDOW_HOURS = 3.4;
const SEVEN_DAY_WINDOW_HOURS = 70;

const PROMO_TEST_PATH = CHECK_PATH.expiredPromo;
const PROMO_MESSAGES_PATH = 'web/src/cart/promo-messages.ts';
const PROMO_FIELD_PATH = 'web/src/cart/PromoField.tsx';
const PROMO_VALIDATE_PATH = 'api/src/promo/validate.ts';
const PRICE_BOUND_PATH = 'web/src/search/price-bound.ts';
const QUERY_REWRITE_PATH = 'web/src/search/query-rewrite.ts';
const VITEST_COMMAND = 'pnpm --filter web exec vitest run src/cart';

/** The session of the implementer of the expired promo code message. */
export function expiredPromoImplementer(runId: string, clock: FixtureClock): readonly ScriptStep[] {
  const builder = new ScriptBuilder(runId, MODEL_SONNET);
  builder
    .session()
    .raw({ type: 'system', subtype: 'init', session_id: `${runId}-session`, model: MODEL_SONNET, cwd: '/work/storefront/slot-3', tools: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Task', 'Write'] })
    .say('Reading the frozen unit tests of #58 first: they pin the wording of the message and the format of the date.')
    .raw({ type: 'system', subtype: 'hook_started', hook_name: 'PreToolUse:Read', hook_event: 'PreToolUse' })
    .tool('Read', { file_path: PROMO_TEST_PATH }, contentOf(fileAt(EXPIRED_PROMO_FILES, PROMO_TEST_PATH)))
    .hook('PreToolUse', 0, '')
    .tool('Grep', { pattern: 'Invalid code', path: 'web/src' }, `${PROMO_FIELD_PATH}:37:      <p className="field-error">Invalid code</p>`)
    .subagent(
      'Find where a rejected promo code is turned into a message',
      'Explore',
      (parent) => {
        builder
          .tool('Grep', { pattern: 'validatePromoCode', path: 'api/src' }, `${PROMO_VALIDATE_PATH}:9\napi/src/routes/cart/promo.post.ts:6`, { parent })
          .tool(
            'Read',
            { file_path: PROMO_VALIDATE_PATH },
            [
              'export function validatePromoCode(code: string, now: Date): PromoCheck {',
              '  const promo = findPromo(code);',
              "  if (promo === null || promo.endsAt < now) return { ok: false, reason: 'unknown' };",
              '  return { ok: true, promo };',
              '}',
            ].join('\n'),
            { parent },
          )
          .say('An expired code and a code nobody issued are both reported as unknown, which is why the page can only say "Invalid code".', { parent });
      },
      'validatePromoCode folds expiry into the unknown reason (api/src/promo/validate.ts line 11). The field renders one fixed string for every rejection (PromoField.tsx line 37).',
    )
    .say('The server cannot tell the two cases apart today. I will give it a distinct reason that carries the end date, add a small module that turns a reason into text, and use it in the field.')
    .tool('Write', { file_path: PROMO_MESSAGES_PATH }, createdLine(PROMO_MESSAGES_PATH))
    .raw({ type: 'system', subtype: 'hook_response', hook_name: 'PostToolUse:Write', hook_event: 'PostToolUse', exit_code: 0 })
    .tool('Edit', { file_path: PROMO_VALIDATE_PATH }, editedLine(fileAt(EXPIRED_PROMO_FILES, PROMO_VALIDATE_PATH)))
    .tool('Edit', { file_path: PROMO_FIELD_PATH }, editedLine(fileAt(EXPIRED_PROMO_FILES, PROMO_FIELD_PATH), 1, 0))
    .hook('PostToolUse', 0, 'prettier: formatted 3 files')
    .progress()
    .say('Before I run anything I want to see what the staging API answers for a code that ended last month, to be sure the date arrives as an ISO day.');
  builder
    .permissionDenied('Bash', 'curl https://staging.storefront.example.com/api/cart/promo was refused: this command has no network access.')
    .tool(
      'Bash',
      { command: 'curl -s https://staging.storefront.example.com/api/cart/promo -d \'{"code":"AUTUMN20"}\'' },
      'Permission denied: this command runs without network access.',
      { isError: true },
    );
  builder
    .say('The sandbox keeps checks offline, so I will rely on the unit tests and the shape of the validator instead.')
    .rateLimit([
      { window: 'five_hour', utilization: 0.42, resetsAt: clock.inHours(FIVE_HOUR_WINDOW_HOURS) },
      { window: 'seven_day', utilization: 0.63, resetsAt: clock.inHours(SEVEN_DAY_WINDOW_HOURS) },
    ])
    .tool(
      'Bash',
      { command: VITEST_COMMAND },
      [
        ` FAIL  ${PROMO_TEST_PATH} > promoMessage > names the day an expired code stopped working`,
        "AssertionError: expected 'This code expired on 30 Sep 2026' to be 'This code expired on 30 September 2026'",
        '',
        ' Test Files  1 failed (1)',
        '      Tests  1 failed | 2 passed (3)',
      ].join('\n'),
      { isError: true, long: true },
    )
    .say('The date formatter abbreviates the month. The wording the check pins uses the long month name, so I will ask for the long style explicitly.')
    .tool('Edit', { file_path: PROMO_MESSAGES_PATH }, `Edited ${PROMO_MESSAGES_PATH} (+1 −1)`)
    .tool('Bash', { command: VITEST_COMMAND }, ` ✓ ${PROMO_TEST_PATH} (3 tests) 21ms\n\n Test Files  1 passed (1)\n      Tests  3 passed (3)`, { long: true })
    .progress()
    .say('The unit tests pass. Finishing the session now so that the completion gate runs.')
    .gate([
      { name: 'frozen-checks', outcome: 'passed', detail: 'passed' },
      { name: 'lint', outcome: 'failed', detail: `${PROMO_FIELD_PATH} 3:10  error  'Fragment' is defined but never used  @typescript-eslint/no-unused-vars` },
      { name: 'typecheck', outcome: 'skipped', detail: 'skipped because an earlier step failed' },
      { name: 'acceptance', outcome: 'skipped', detail: 'skipped because an earlier step failed' },
      { name: 'unit-tests', outcome: 'skipped', detail: 'skipped because an earlier step failed' },
      { name: 'build', outcome: 'skipped', detail: 'skipped because an earlier step failed' },
    ])
    .hook('Stop', 2, `The completion gate failed. Fix what is reported below, then finish again.\n\nlint: ${PROMO_FIELD_PATH} 3:10  error  'Fragment' is defined but never used`)
    .say('The gate refuses the import I left behind when I replaced the old paragraph. Removing it.')
    .tool('Edit', { file_path: PROMO_FIELD_PATH }, `Edited ${PROMO_FIELD_PATH} (+0 −1)`)
    .gate([
      { name: 'frozen-checks', outcome: 'passed', detail: 'passed' },
      { name: 'lint', outcome: 'passed', detail: 'passed' },
      { name: 'typecheck', outcome: 'passed', detail: 'passed' },
      { name: 'acceptance', outcome: 'passed', detail: 'passed' },
      { name: 'unit-tests', outcome: 'passed', detail: 'passed' },
      { name: 'build', outcome: 'passed', detail: 'passed' },
      { name: 'skill-eval', outcome: 'skipped', detail: 'not configured' },
    ])
    .hook('Stop', 0, 'The completion gate passed.')
    .say('Done: an expired code now reads "This code expired on <date>" in the shop locale, an unknown code keeps its generic message, and both are announced as alerts. The frozen tests and the gate pass.');
  return builder.build();
}

/** The second review of the natural-language search. */
export function searchSecondReview(runId: string): readonly ScriptStep[] {
  const builder = new ScriptBuilder(runId, MODEL_OPUS);
  builder
    .session()
    .say('Reviewing the correction of #52 against its spec and its frozen checks. Another session wrote it. Round 1 asked for the price comparison to be fixed, so I will check that first and then read the whole diff again for anything new.')
    .tool('Read', { file_path: 'diff.patch' }, diffStat(NATURAL_LANGUAGE_SEARCH_FILES))
    .tool(
      'Grep',
      { pattern: 'parsePriceBound', path: 'web/src/search' },
      [
        grepHit(fileAt(NATURAL_LANGUAGE_SEARCH_FILES, PRICE_BOUND_PATH), 'export function parsePriceBound'),
        grepHit(fileAt(NATURAL_LANGUAGE_SEARCH_FILES, QUERY_REWRITE_PATH), 'parsePriceBound(text)'),
      ].join('\n'),
    )
    .tool('Read', { file_path: PRICE_BOUND_PATH }, contentOf(fileAt(NATURAL_LANGUAGE_SEARCH_FILES, PRICE_BOUND_PATH)))
    .tool('Read', { file_path: CHECK_PATH.searchEval }, contentOf(fileAt(NATURAL_LANGUAGE_SEARCH_FILES, CHECK_PATH.searchEval)))
    .say(
      'The comparison words are now mapped to a maximum or a minimum explicitly, and "under 60" yields { direction: "max", cents: 6000 }, which settles the blocking finding of round 1. Criteria 1 to 4 are each covered by a frozen check, the checks are untouched, and nothing outside the search module changed. One line of web/src/search/filters.ts carries a code comment, which the repository rules do not allow.',
    )
    .say(fenced({ findings: (REVIEW_FINDINGS[runId] ?? []).map(({ severity, category, file, line, summary }) => ({ severity, category, file, line, summary })) }));
  return builder.build();
}
