## What to look at

**Before** on base `1111111`: 2 acceptance tests fail on an assertion (playwright).
**After** on `2222222`: the gate passes (frozen-checks, lint, acceptance).

| Evidence | Before | After |
|---|---|---|
| `app/test-results/header.png` | ![header.png, before](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/before/app/test-results/header.png?raw=true) | ![header.png, after](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/after/app/test-results/header.png?raw=true) |
| `app/test-results/trace.zip` | not produced | [app/test-results/trace.zip](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/after/app/test-results/trace.zip) |

Logs: [before log](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/before.log) · [after log](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/after.log) · [diff stat](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/diffstat.txt) · [acceptance tests](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/acceptance-tests.json)

## Issues

Closes #42
Depends on #7

## Acceptance criteria

1. The mockup header links the conversation.
   Proven by `app/e2e/mockup-link.spec.ts`.
2. The link opens the conversation at the producing message.
   Proven by `app/e2e/mockup-link.spec.ts`, `app/e2e/conversation.spec.ts`.

| Criterion | Test | Base | Branch |
|---:|---|---|---|
| 1 | `app/e2e/mockup-link.spec.ts > mockup header > links the conversation` | red (assertion) | green |
| 2 | `app/e2e/mockup-link.spec.ts > mockup header > links the conversation` | red (assertion) | green |
| 2 | `app/e2e/conversation.spec.ts > opens at the producing message` | red (assertion) | green |

## Risks

- [correctness] (app/pages/mockup.vue:18) The link has no accessible name on narrow screens.
- Evidence `app/test-results/trace.zip` was not produced before the change.

## Technical details

- Type: `ui`
- Branch: `factory/42-link-mockups-to-their-conversation` from `1111111`
- Implementer attempts: 2 (1 resumed with feedback, 0 escalated)
- Agent cost: $3.46
- Gate:
  - frozen-checks: passed
  - lint: passed
  - acceptance: passed
- Frozen checks:
  - `app/e2e/conversation.spec.ts` sha256 `aaaaaaaaaaaa`
  - `app/e2e/mockup-link.spec.ts` sha256 `bbbbbbbbbbbb`

| File | Added | Removed |
|---|---:|---:|
| `app/e2e/mockup-link.spec.ts` | 24 | 0 |
| `app/pages/mockup.vue` | 6 | 1 |
