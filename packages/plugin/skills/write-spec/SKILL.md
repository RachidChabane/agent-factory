---
name: write-spec
description: Write the spec file of an issue and create the issue with its dependencies. Use when a request, a bug or a finding becomes work for the factory.
---

# Write a spec

A spec is a Markdown file that `agent-factory issue create` turns into an issue. The command refuses a file whose format is wrong and names each problem.

## Format

```markdown
Title: Show the cart total in the header badge
Labels: type:ui
Films: checkout-flow

## Need
Shoppers cannot tell what their cart costs without opening it.

## Acceptance criteria
1. The header badge shows the sum of the cart's line totals, in the shop's currency.
2. The total updates when a line is added, changed or removed.

## Out of scope
- Discount codes.

## Expected proof
Component tests assert both criteria. The pull request updates the cart page of the user guide.
```

- Line 1 is `Title:`, line 2 is `Labels:`. The optional `Films:` line follows `Labels:`; it belongs to a project that configures films (`declare-films`). Nothing comes before `## Need`.
- The four sections are exactly `## Need`, `## Acceptance criteria` (a numbered list), `## Out of scope` (a bullet list) and `## Expected proof`. None is empty.
- `Labels:` holds exactly one `type:` label of the project's issue types, and may hold `kind:<commit type>`. It never holds `spec:validated`: validation is a gesture, not a label to write.
- Read the project's issue types, with the proof each demands and what its checks look like: `curl -s <cockpit>/api/state | jq '.projects[] | {id, issueTypes}'`.

## Rules

- Every acceptance criterion is checkable by the repository's own test tooling, as the issue type describes it. State an observable result (a value, a response, what a screen shows), not an activity.
- Documentation requirements go in Need and in Expected proof, never in the criteria: a document is not behaviour a check can fail.
- Behaviour that needs the whole running product (several services, a signed-in user, a journey across screens) is not a criterion. Declare a film (`declare-films`) and say in Expected proof what it shows.
- One issue per independently mergeable change. When part B cannot be merged before part A, they are two issues and B is blocked by A. When either can ship alone, they do not depend on each other.
- Name the scope in Out of scope: whatever a reader could mistake for part of the change.

## Create

1. Create the blocking issues first. `agent-factory issue create <spec.md>` prints `<project>#<number> created …`; keep the number.
2. Create the dependent issue with `--blocked-by`: `agent-factory issue create <spec.md> --blocked-by <number>[,<number>]`. An unknown number creates nothing. The factory starts an issue once every issue it is blocked by is merged.
3. On a GitHub project the command first prints what it would create and exits 5. Read it, then run it again with `--confirm`.
4. The issue is a draft until someone validates it. To validate at creation, add `--start --as orchestrator --reason "<why>"`; to validate a draft afterwards, run `agent-factory issue validate <issue> --as orchestrator --reason "<why>"`. The factory refuses it when the project does not delegate validating specs: create the draft without `--start` and list it for the operator.

A request the operator stored becomes specs the same way. `agent-factory request challenge <id>` drafts specs from it as files under `<home>/projects/<project>/requests/<request id>/` (`agent-factory status` prints the home). Review each draft against these rules, then run `agent-factory issue create` on the draft's file: the issue is linked to its request.
