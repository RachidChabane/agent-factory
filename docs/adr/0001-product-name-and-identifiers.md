# ADR 0001: Product name and identifiers

Status: accepted
Date: 2026-10-12

## Context

The product drives Claude Code agents from a validated issue specification to a
merged pull request, for any repository and any technology stack. It needs a name,
a repository, a command name, a package scope, a home directory, an environment
variable prefix and a default server port. Several instances of a factory, or a
factory and other local servers, can run on the same machine, so none of these
identifiers may collide with a sibling installation.

## Options

1. **A descriptive name, `agent-factory`.** Says what the product is; easy to find
   and to remember; generic enough that other projects use similar words.
2. **A coined name.** Distinctive, but says nothing until explained, and every
   document has to spend a sentence on it.
3. **`factory` alone.** Shortest, but collides with common words and other tools
   (`FACTORY_HOME`, `factory` binaries) and makes environment variables ambiguous.

## Decision

Option 1:

| Identifier | Value |
|---|---|
| Product | Agent Factory |
| Repository | `agent-factory` |
| Command | `agent-factory` (front door `script/factory`) |
| Packages | `@agent-factory/*` |
| Home directory | `~/.agent-factory`, overridden by `AGENT_FACTORY_HOME` |
| Environment variable prefix | `AGENT_FACTORY_` |
| Default server port | `7430` |

Inside the target repositories the factory keeps short, configurable defaults: the
branch prefix `factory/` and the pull request label `factory`.

## Consequences

- Every environment variable the product reads starts with `AGENT_FACTORY_`, so a
  shell configured for another tool never leaks into it.
- A test, a demonstration or a rehearsal always sets `AGENT_FACTORY_HOME`
  explicitly; the default home is only ever used by an operator's real installation.
- A second installation on the same machine changes `server.port` and
  `AGENT_FACTORY_HOME`; nothing else is shared.
