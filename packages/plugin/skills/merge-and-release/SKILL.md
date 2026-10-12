---
name: merge-and-release
description: Review the open pull requests, merge the ones the project delegates, prepare a one-line review of the others, and report a release whose gate allows it. Use at the start of a session, after each merge, and when watch reports no-free-worktree.
---

# Merge and release

## List

```sh
curl -s <cockpit>/api/state | jq -r '.projects[] | .id as $project | .pullRequests[] | select(.state == "open") | [$project, .number, .issueNumber, .headSha, (.mergeable | tostring), (.mergeBlockers | join("; "))] | @tsv'
```

One row per open pull request: project, pull request, issue, head, mergeable, what blocks the merge.

## Review

```sh
curl -s <cockpit>/api/state | jq --arg project <project> --argjson number <pull-request> '.projects[] | select(.id == $project) | .pullRequests[] | select(.number == $number) | {title, headSha, mergeable, mergeBlockers, evidenceComplete, missingEvidence, checks: .checks.value, reviewRounds: [.reviewRounds[] | {round, findings: [.findings[] | select(.resolved | not) | {severity, summary}]}], files: [.files[].path]}'
```

With `agent-factory status <issue>`, check that:

- every acceptance criterion of the spec is proven by the evidence, and `evidenceComplete` is true;
- no unresolved finding is `blocking`;
- every failing check has `failsOnBase` true, and none is pending;
- the changed files stay within the spec's scope.

## Merge

Merge on your own judgement only a change that needs none: every criterion proven by checks, a clean review, nothing to look at or choose. A visual change, wording, a price, a behaviour the spec leaves open or a security-relevant file needs the operator.

```sh
agent-factory merge <pull-request> --expected-head <sha> --as orchestrator --reason "<why>"
```

`<sha>` is the full head you reviewed. Read `headSha` again just before merging and never type one from memory. The factory merges only that head: it refuses when the head moved, when a check fails or is still running, when the issue is not awaiting a merge, or while a film of the pull request is queued or running. It then removes the evidence folder and squash-merges. A refusal states its reason: read it, and re-review the new head when the head moved. The factory refuses a merge the project's autonomy policy does not delegate, and names the missing rule: that ends your part, and the review below goes to the operator.

When you may not merge, write one line for the operator: `storefront#12 pull request 31, <title>: <criteria proven>, <review result>, <checks>; <what needs their eye>. Merge: agent-factory merge 31 --expected-head <sha>`.

Merging a pull request frees its worktree, so waiting issues start at the factory's next tick.

## Checks that fail everywhere

A check that fails on every pull request and on the base branch is the repository's problem, not the change's. The factory marks it `failsOnBase` and the merge does not wait for it. Merge as usual, report the check, and write a spec to fix it (`write-spec`).

A re-run of a check runs the workflow as the original run had it. After a workflow fix, a check that is re-run can still run the old workflow until the pull request gets a new run, which a new commit of its branch gives. Do not loop on re-runs: say which fix the pull request lacks.

## Releases

The factory evaluates each release against its gate: no open audit among its commits, complete evidence for every merged pull request, healthy environments before production. A release is cut from the cockpit's Releases page, and production is deployed by a person. When a release is promotable, tell the operator its id and its commits; when blocked, give the reasons the gate lists:

```sh
curl -s <cockpit>/api/state | jq '.projects[] | .id as $project | .releases[] | {$project, id, state, promotable: .gate.promotable, blocking: .gate.blockingReasons}'
```
