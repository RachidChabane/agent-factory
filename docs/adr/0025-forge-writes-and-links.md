# ADR 0025: Retry forge calls safely, and let the forge build its links

Status: accepted
Date: 2026-10-12

## Context

GitHub answers some calls with transient errors (timeouts, 502 and 504). A retried
write may have landed the first time: a second issue, a second comment or a second
pull request. Separately, pull request bodies linked their evidence to github.com
whatever the forge, which breaks on a local forge and would break on another forge.

## Options

1. **No retry**: one transient error stops the issue.
2. **Retry everything**: duplicates on a write that had landed.
3. **Retry by kind**: reads always; idempotent writes as they are; a write that
   creates something only after checking that it did not land; a workflow dispatch
   never. And let the forge port build file links.

## Decision

Option 3.

- Transient failures are retried after 2, 8 and 30 seconds. A creating write (issue,
  comment, dependency link, pull request, merge) first looks for its own result and
  stops there when it finds it. A workflow dispatch is never repeated.
- The links of a pull request body come from the forge: a GitHub project links to its
  repository's pages; a local forge links to the factory's own server, which reads the
  commit's file from the project's clone. The cockpit reads a pull request's diff and a
  commit's file on demand from the same clone.

## Consequences

- A flaky forge delays an issue instead of stopping or duplicating it.
- A forge adapter for another service (GitLab, for example) brings its own links
  without touching the pipeline.
