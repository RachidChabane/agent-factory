# ADR 0028: Continuous integration through the repository's own scripts

Status: accepted
Date: 2026-10-12

## Context

CI must check lint, types, every test level, the cockpit's build and journeys, the
screenshots, secrets and the denylist, and the code's security, for a repository that
starts private on a personal account and is meant to become public. GitHub's hosted
runners are not available to the account while it is private.

## Options

1. **Workflows that hold the logic** (inline commands, marketplace actions). CI becomes
   the only place where a check is reproducible.
2. **Thin workflows over the repository's scripts**: every job runs one
   `script/<verb>`, which a contributor runs the same way on their machine.

## Decision

Option 2.

- Each job checks out, sets the workspace up with `./.github/actions/setup` (Node from
  `.node-version`, pnpm from `package.json`, the lockfile), and runs one script:
  `script/scan`, `script/lint`, `script/test`, `script/e2e-example`,
  `script/e2e-cockpit`, `script/screenshots --check`. `.github/workflows/verify.yml`
  runs any one script on demand.
- Actions are pinned to full commit hashes; jobs get `permissions: {}` unless they
  need more; pinned tools (gitleaks, actionlint) are installed by
  `script/install-tool` after a checksum check, never system-wide.
- While the repository is private, jobs run on the maintainer's self-hosted macOS
  runner (`[self-hosted, mac-mini]`), one job at a time; once public, on
  `ubuntu-latest`. Jobs that only make sense on GitHub's runners or on a public
  repository (the Linux sandbox's real tests, CodeQL, coverage upload) are guarded
  by `!github.event.repository.private`, and their scripts run locally until then.
- Dependabot proposes updates of the npm packages and of the pinned actions weekly.

## Consequences

- A red job reproduces on a workstation with the same script.
- The self-hosted runner is removed before the repository becomes public; until then
  the Linux-only jobs are proven locally and skipped in CI.
