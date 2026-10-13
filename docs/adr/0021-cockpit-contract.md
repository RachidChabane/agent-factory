# ADR 0021: One contract between the factory and its cockpit

Status: accepted
Date: 2026-10-12

## Context

The cockpit shows every project, issue, run, pull request, environment and reading of
an installation, live, and acts on the factory. Two failure modes recur in such
tools: values the server never computed shown as if real (a zero for an unknown, the
creation date for a detection date), and buttons whose effect differs from their
label or is never confirmed.

## Options

1. **A REST API per resource** with its own documentation. Many endpoints to keep
   consistent, and nothing ties what the server sends to what the client expects.
2. **A shared contract package**: zod schemas for one snapshot, one event stream and
   a set of commands, imported by the server and the cockpit.

## Decision

Option 2, in `packages/cockpit/src/contract`.

- **Snapshot** (`GET /api/state`): the whole installation as the projections compute
  it. A value the factory does not know is `null`, never a stand-in; every reading of
  something outside the event log (the forge, the machine, the subscription) carries
  the time it was read and the last error.
- **Stream** (`GET /api/events`, server-sent events): the factory's events as they are
  appended, run logs as agents write them, and telemetry between events. The cockpit
  reloads the snapshot after events and every 30 seconds while the stream is open.
- **Commands** (`POST /api/commands/<name>`): each body is validated by its schema; the
  answer names the event the command recorded and its effect in words, or the reason
  it was refused, which the cockpit shows as given. Every command must carry the
  per-process token the cockpit page holds, so another page of the browser cannot act
  on the factory.
- Large or rarely needed data is read on demand rather than carried in the snapshot:
  run logs, a pull request's diff, a commit's file.
- The page the cockpit lands on is the changes since a moment the operator chooses and
  the browser remembers; the board is a page of its own.

## Consequences

- The server's tests parse their snapshot with the cockpit's schemas, so a field the
  cockpit expects and the server stopped sending fails a test.
- A new view is a projection, a schema and a component; a new action is a command
  schema, its handler and the button that sends it.
