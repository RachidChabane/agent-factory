# ADR 0019: Declare delivery as environments, a release model and a gate

Status: accepted
Date: 2026-10-12

## Context

What happens after a merge differs between teams: some deploy every merge to a
development environment, batch merges into releases for pre-production, and deploy
production by hand; some only tag; some release nothing. The factory must show where
each change is, say whether a release may go to production, and never deploy
production itself.

## Options

1. **One built-in pipeline shape** (for example release-please plus three named
   environments). Fits one team.
2. **No delivery model**: the factory stops at the merge. The operator loses the view
   of what is deployed where and the gate before production.
3. **A declared delivery section per project**: the release model, the environments
   with their promotion policy, their deployment source and their health checks, and
   a release gate computed from what the factory recorded.

## Decision

Option 3.

- `delivery.release` is `release-please`, `tags` (with a tag pattern) or `none`. A
  release pull request whose version is already published, by its own tag or by a
  newer tag of the same component, is shown as superseded, never as pending; versions
  compare as semantic versions, never by branch name.
- Each environment declares `promotion`: `automatic` (each merge reaches it on its
  own), `batch` (a release the operator cuts) or `manual` (only when the operator
  runs the deployment), whether it is `production`, where its deployments are read
  from (a GitHub environment or nothing), its health checks, and `wakeUpSeconds` for
  an environment that scales to zero.
- A non-production environment may declare `redeploy`, a workflow the factory
  dispatches at the deployed version on the operator's order. The configuration
  refuses `redeploy` on an environment that is production or looks like it.
- The release gate of a candidate is computed, not asserted: no audit of its commits
  still open or unresolved, the evidence of every merged pull request complete, and,
  when the project declares health checks before production, at least one recorded
  and passing.

## Consequences

- The cockpit shows each environment with its current deployment, its history and its
  health series, each with its read time, and each release with the reasons its gate
  blocks.
- Each deployment lists the commits it delivered, from the nearest older deployment that
  landed to its own sha, and each environment lists the commits of the base branch that
  wait behind its current deployment. The project's clone answers; a commit it lacks gives
  an unknown list, never an empty one, and a commit that a pull request of the factory
  merged links to that pull request through its recorded merge sha.
- Production stays a human gesture: the factory links to the production workflow and
  never dispatches it.
- A project without delivery declares nothing and loses nothing else.
