# ADR 0013: Notification channels as a list of adapters

Status: accepted
Date: 2026-10-12

## Context

The operator is not watching the cockpit all day. A pull request ready to merge, an
issue that needs a human, a release gate result or a pause of the factory must reach
them where they are. Teams use different tools, and an installation may want more
than one at once (a team chat plus a desktop notification).

## Options

1. **One built-in chat integration.** Fits one team only.
2. **Shell hooks** that the operator writes. Flexible, but every team rewrites the
   same message formatting and secrets end up in scripts.
3. **A list of typed channels**, each an adapter behind the `Notifier` port:
   `system`, `google-chat`, `slack` and a generic `webhook`.

## Decision

Option 3. `notifications.channels` lists the channels; every notice goes to all of
them through a composite notifier that isolates failures (one failing channel never
blocks the others, and the failure is logged with the channel's kind).

- `system`: a desktop notification (`osascript` on macOS, `notify-send` on Linux).
- `google-chat` and `slack`: incoming webhooks, with a message formatted for each.
- `webhook`: a JSON `POST` of the notice (`title`, `body`, `link`) with optional
  headers.

Webhook URLs and header secrets are never written in the configuration file: they
are references to environment variables (`{ fromEnvironment: NAME }`). Identical
notices within `notifications.dedupeWindowMinutes` are sent once. Every notice
carries a link to the cockpit page of its subject, built from `server.publicUrl`.

## Consequences

- Adding a channel is a new adapter and a new member of the configuration union;
  the use cases only know the port.
- A channel whose variable is not set is reported by `agent-factory validate` and
  shown in the cockpit as not configured, rather than failing silently.
- The generic webhook covers tools without a dedicated adapter.
