# ADR 0024: A local forge runs the project's gate as its checks

Status: accepted
Date: 2026-10-12

## Context

A rehearsal on a local forge (ADR 0010) has no continuous integration. Pull requests
showed no check at all, or a synthetic success, so the merge on order and the release
gate were exercised against values nobody computed. Separately, on a real forge a
check that already fails on the base branch blocked every pull request although no
change caused it.

## Options

1. **No checks on a local forge.** The merge and release rules are never exercised
   before going live.
2. **A synthetic success.** A value the factory made up.
3. **The project's own gate as the forge's checks**, run on each commit a pull
   request points at, and a comparison with the checks of the base branch on every
   forge.

## Decision

Option 3.

- With `forge.checks: gate`, the local forge runs the project's setup and gate
  commands in a clean, confined checkout of each commit the first time its checks are
  asked for, one commit at a time, and reports one check per step with the gate's log
  as its link and each step's duration; a commit shows one pending check while its
  turn comes. `forge.checks: none` keeps no checks.
- On every forge, a failing check that fails the same way on the head of the base
  branch is marked as failing on the base: it is shown, and it blocks neither the
  merge nor the cut of a release.

## Consequences

- A rehearsal exercises the same merge and release rules as a real forge, on real
  results.
- A check that is red on the base no longer holds every pull request hostage; the
  operator still sees it.
