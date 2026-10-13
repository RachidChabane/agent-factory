---
name: merge-and-release
description: Review the open pull requests, merge the ones the project delegates, prepare a short review of the others for the operator, and report a release whose gate allows it. Use at the start of a session, after each merge, and when watch reports no-free-worktree.
---

# Merge and release

## List

```sh
curl -s <cockpit>/api/state | jq -r '.projects[] | .id as $project | .pullRequests[] | select(.state == "open") | [$project, .number, .issueNumber, .headSha, (.mergeable | tostring), (.mergeBlockers | join("; "))] | @tsv'
```

One row per open pull request: project, pull request, issue, head, mergeable, what blocks the merge.

## Review

```sh
curl -s <cockpit>/api/state | jq --arg project <project> --argjson number <pull-request> '.projects[] | select(.id == $project) | .pullRequests[] | select(.number == $number) | {title, headSha, mergeable, mergeBlockers, readyNotice, evidenceComplete, missingEvidence, images: [.evidence[] | select(.kind == "image-compare") | {title, afterUrl}], checks: .checks.value, reviewRounds: [.reviewRounds[] | {round, findings: [.findings[] | select(.resolved | not) | {severity, file, line, summary}]}], files: [.files[].path]}'
```

With `agent-factory status <issue>`, check that:

- every acceptance criterion of the spec is proven by the evidence, and `evidenceComplete` is true;
- no unresolved finding is `blocking`, and every unresolved finding that is not goes into the review for the operator;
- every failing check has `failsOnBase` true, and none is pending;
- the changed files stay within the spec's scope.

`readyNotice.holds` names what keeps the operator from being told that the pull request is ready: each check that failed or has not finished, and each film. The notice waits for every check of the head, including one that also fails on the base branch, which the merge does not wait for.

## Merge

Merge on your own judgement only a change that needs none: every criterion proven by checks, a review with no unresolved finding, blocking or not, nothing to look at or choose. A visual change, wording, a price, a behaviour the spec leaves open or a security-relevant file needs the operator.

```sh
agent-factory merge <pull-request> --expected-head <sha> --as orchestrator --reason "<why>"
```

`<sha>` is the full head you reviewed. Read `headSha` again just before merging and never type one from memory. The factory merges only that head: it refuses when the head moved, when a check fails or is still running, when the issue is not awaiting a merge, or while a film of the pull request is queued or running. It then removes the evidence folder and squash-merges. A refusal states its reason: read it, and re-review the new head when the head moved. The factory refuses a merge the project's autonomy policy does not delegate, and names the missing rule: that ends your part, and the review below goes to the operator.

Merging a pull request frees its worktree, so waiting issues start at the factory's next tick.

## The review for the operator

For each pull request you may not merge, prepare a short review in this order:

1. **Actions.** What the operator must decide or do, one line each, with the command. Nothing comes before them.
2. **Screenshots.** One per visible change, cropped to the part that changed, taken from the pull request's evidence: download the `afterUrl` of an `image-compare` item (`curl -s <cockpit><afterUrl> -o <file>`) and crop it with the image tool of the machine. Read the cropped file to check that it shows the change, and give its path.
3. **Details.** Apart from the two above: the criteria proven, the review result, the checks, the files, the findings.

```markdown
## storefront#12 pull request 31: show the cart total in the header badge

### Actions
- Merge when the badge looks right: `agent-factory merge 31 --expected-head <sha>`
- Sort the two non-blocking findings below: keep, fix in a follow-up issue, dismiss.

### Screenshots
- Header badge: /tmp/review-31-badge.png

### Details
- 3 of 3 criteria proven; checks green.
- Non-blocking: cart/total.ts:41 rounds each line before summing; cart/total.ts:88 repeats the currency lookup.
```

## Findings that do not block

A non-blocking finding of the review sometimes describes a real defect. Never drop one: list each under Details with its file and line, and put one line under Actions that asks the operator to sort them: keep a finding as it is, have it fixed in a follow-up issue (`write-spec`), or dismiss it.

## A pull request held by a failing check

A check that fails on the head holds the ready notice and, unless the base branch fails it too, the merge. When an external quality check reports a failure (a code-quality service that reports a check on the commit, for example), read its findings on its page on the forge: the check's `url` in `checks`, with the forge's command line or `curl`. Then put them in the review as feedback ready to record: write the findings in a file outside the repository and the factory's home, one instruction for the implementer per finding with its file and line, and give the operator the command under Actions, with the check's name as the author:

```sh
agent-factory pr feedback <pull-request> <file> --author <check-name>
```

Recording feedback is not a gesture the autonomy policy delegates: never run it yourself and never give it `--as`. The factory starts a new cycle for the implementer, and the notice goes out again once every check of the new head has passed.

## Checks that fail everywhere

A check that fails on every pull request and on the base branch is the repository's problem, not the change's. The factory marks it `failsOnBase` and the merge does not wait for it, although the ready notice does. Merge as usual, report the check, and write a spec to fix it (`write-spec`).

A re-run of a check runs the workflow as the original run had it. After a workflow fix, a check that is re-run can still run the old workflow until the pull request gets a new run, which a new commit of its branch gives. Do not loop on re-runs: say which fix the pull request lacks.

## Releases

The factory evaluates each release against its gate: no open audit among its commits, complete evidence for every merged pull request, healthy environments before production. A release is cut from the cockpit's Releases page, and production is deployed by a person. When a release is promotable, tell the operator its id and its commits; when blocked, give the reasons the gate lists:

```sh
curl -s <cockpit>/api/state | jq '.projects[] | .id as $project | .releases[] | {$project, id, state, promotable: .gate.promotable, blocking: .gate.blockingReasons}'
```
