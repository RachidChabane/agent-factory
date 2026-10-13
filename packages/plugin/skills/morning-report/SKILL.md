---
name: morning-report
description: Tell the operator what the factory did, what waits for them, what is blocked, what you decided for them and where the subscription limits stand. Use each morning, and whenever the operator asks where things stand.
---

# Morning report

## Read, in this order

1. `agent-factory status`: whether the factory runs, the pauses, the issues by state of each project.
2. `agent-factory usage --refresh`: each account's limits with their reset times and reading time.
3. What merged since the last report:

   ```sh
   curl -s <cockpit>/api/state | jq -r --arg since <ISO time of the last report> '.projects[] | .id as $project | .pullRequests[] | select(.state == "merged" and .mergedAt >= $since) | "\($project)#\(.issueNumber) pull request \(.number): \(.title)"'
   ```

4. The open pull requests, reviewed as `merge-and-release` says.
5. `agent-factory watch --once --all`: every blocker present now. For each issue it names, `agent-factory status <issue>`.
6. Your notes of the gestures you made with `--as orchestrator`, each with its reason.

## Write

Five sections, in this order. Each is a list of one-line items, except `Waiting for you`, whose entries are the reviews that `merge-and-release` lays out. An empty section says `none`.

```markdown
# Factory report, 2026-10-13

## Merged
- storefront#12 pull request 31: show the cart total in the header badge

## Waiting for you
### storefront#14 pull request 33: filter the catalogue by category
Actions
- Merge once the layout looks right: `agent-factory merge 33 --expected-head <sha>`
- Sort the non-blocking finding: keep, fix in a follow-up issue, dismiss.

Screenshots
- Category filter: /tmp/review-33-filter.png

Details
- 3 of 3 criteria proven; checks green.
- Non-blocking: catalogue/filter.ts:41 matches the category case-sensitively.

## Blocked
- ledger#7: the reviewer's blocking finding stands after two attempts. Needs: a decision on rounding, yours.

## Decided for you
- Answered ledger#9: invoices round once, on the subtotal. Reason: docs/pricing.md says so.

## Usage and limits
- default: weekly_all 62% used, pauses at 85%, resets 2026-10-14T00:00:00Z (read 2026-10-13T06:00:00Z)
```

- Name work as `<project>#<issue>` and `pull request <number>`.
- A blocked item states its cause and who must act.
- A waiting entry is a review: the actions first, each with its command, then a screenshot per visible change, then the details apart.
- Copy each usage figure with its reset time and its reading time.
- Add the pauses and the factory's state to the first line of `Blocked` when the factory is stopped or paused.
