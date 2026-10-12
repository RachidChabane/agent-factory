# ADR 0012: Read subscription usage from the Claude Code usage report, classified by kind

Status: accepted
Date: 2026-10-12

## Context

Agent runs draw on a Claude subscription whose limits are shared with the
operator's own work: a session window and weekly windows, one of them per model.
The factory must pause before a limit is reached and the cockpit must show how much
is left. The rate-limit events that agent runs emit only arrive while a run is in
progress, so between runs the value shown goes stale, and a reset that happened
since is invisible.

## Options

1. **Rate-limit events of agent runs only.** Free, but stale between runs.
2. **Scrape the usage page of the web application.** Fragile and needs a browser
   session.
3. **Ask the CLI for its usage report:** `claude -p "/usage" --output-format
   stream-json --verbose --setting-sources "" --strict-mcp-config`, run with the
   `CLAUDE_CONFIG_DIR` of each account. The command is answered locally, costs no
   tokens, and its stream carries `usage_report.rate_limits.limits[]`.

## Decision

Option 3, with option 1 kept as a second source.

- Each limit is classified by its `kind` (`session`, `weekly_all`,
  `weekly_scoped` with the model in `scope.model`), never by its display label.
  Unknown kinds are ignored rather than guessed.
- A reading records its source (`usage-report` or `run-events`), the time it was
  read, each limit's utilization and its reset time.
- The installation reads every account at start, every
  `claude.usage.refreshMinutes`, and on demand from the cockpit and the CLI
  (`agent-factory usage`). A failed read is recorded with its time and reason.
- A reading is **fresh** until `claude.usage.staleAfterMinutes`; a limit whose reset
  time has passed is shown as reset and triggers a new read rather than keeping the
  old percentage.
- The budget governor pauses scheduling when a limit of the selected account
  reaches its threshold (`budget.pauseAt`), using the latest reading of either
  source.

## Consequences

- The cockpit shows each limit with its source and the time it was read; an old
  value is labelled stale instead of being presented as current.
- The usage report format is pinned by a contract test on a recorded stream; a CLI
  change that breaks it fails the test, and the factory reports the read failure
  instead of showing a wrong value.
- Demo mode and CI answer the same command with the fake CLI, so the whole path is
  exercised without a subscription.
