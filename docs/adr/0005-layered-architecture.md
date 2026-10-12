# ADR 0005: Layered architecture in one TypeScript workspace

Status: accepted
Date: 2026-10-12

## Context

The factory combines pure rules (issue lifecycles, retry policy, release gate,
budget), orchestration (the daemon, the pipeline of an issue), integrations with
many external tools (Claude Code, a forge, git, sandboxes, notification channels)
and a web cockpit. The rules must be testable without a network, a forge or a
model, and every integration must be replaceable by configuration.

## Options

1. **One package, folders by feature.** Fast to start; nothing stops a rule from
   importing an adapter, so the rules drift towards the integrations.
2. **Packages per layer in one pnpm workspace**, with dependencies pointing inward
   and enforced by the package graph.
3. **Separate repositories per layer.** Strong isolation, heavy release
   choreography for a single product.

## Decision

Option 2, with Node 24 running TypeScript directly (type stripping, no build step
for the daemon) and Vite building the cockpit:

```
packages/
  domain/       pure rules and types: no I/O, no clock, no randomness, no framework
  application/  use cases and the daemon, orchestrating the domain through ports
  adapters/     implementations of the ports: claude, forge (GitHub, local), git,
                sandbox (macOS, Linux), usage, notifications, tools, store, probes
  plugin/       what is rendered into every agent run: role prompts and hooks
  server/       composition root, command line, HTTP and server-sent events API
  cockpit/      React single-page application, talking only to the server API
tools/          repository tooling (denylist scan, generators), not shipped
```

Dependencies point inward only: `cockpit → server API`, `server → application,
adapters`, `adapters → application ports, domain`, `application → domain`. External
data is parsed at the adapter boundary with zod schemas; inner layers only see
validated types. Every literal with meaning is a named constant next to its
domain concept.

## Consequences

- A new integration (a forge, a sandbox, a notification channel) is a new adapter
  behind an existing port, selected by configuration; the domain and the
  application do not change.
- The TypeScript subset is the one Node can strip: no enums, no namespaces, no
  parameter properties, `.ts` extensions in relative imports.
- The cockpit is the only package with a build step; the server serves its built
  files.
