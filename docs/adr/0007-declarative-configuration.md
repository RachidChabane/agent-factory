# ADR 0007: Declarative configuration with a published schema

Status: accepted
Date: 2026-10-12

## Context

Everything that differs between two users of the factory must live in their
configuration, never in its code: repositories and forges, setup and gate commands,
network needs, environment variables, issue types and their proof, roles and
prompts, delivery environments and release model, audits, connected tools,
notification channels, remote access. Operators edit that file by hand and from the
cockpit; agents and confined commands must never read it. A wrong value must be
reported before anything runs, in words that name the key and the fix.

## Options

1. **YAML with a hand-written JSON Schema and separate runtime validation.** Two
   definitions of the same rules, which drift.
2. **YAML validated by zod, with the JSON Schema generated from the zod schema.**
   One definition; editors get completion and inline errors from the generated
   schema; the runtime gets typed, resolved values.
3. **TypeScript configuration files.** Full expressiveness, but the cockpit cannot
   rewrite them safely and a configuration becomes code to review.

## Decision

Option 2.

- **One file**, `config.yaml` in the installation home (`~/.agent-factory`, or
  `AGENT_FACTORY_HOME`), with a top-level `version: 1`.
- **Installation-level sections** hold what is shared: `server` (with optional
  `remoteAccess`), `claude` (command, accounts, usage refresh), `budget`,
  `resources`, `daemon`, `notifications` (channels), `tools` (connected-tool
  checks) and `defaults` (roles, sandbox and environment defaults).
- **`projects`** is a list; each project declares its forge and repository, base
  branch, clone, conventions (branch prefix, labels), worktree pool and
  concurrency, setup and gate commands with their network declarations, check
  environment, sandbox additions, issue types, role overrides, prompt overrides,
  knowledge sources, evidence capture, delivery (environments, release model,
  promotion policy), audits and project tools. A project value overrides the
  matching default.
- **Secrets never appear in the file.** A secret is a reference to an environment
  variable: `{ fromEnvironment: NAME }`.
- **zod is the source of truth.** `schema/config.schema.json` is generated from it
  by `script/schema`, committed, and checked in CI to be current. A configuration
  file starts with
  `# yaml-language-server: $schema=<URL or path of config.schema.json>`.
- **Validation messages** name the key path, the value, the rule and, where one
  exists, the fix (`projects[0].gate.beforeAcceptance[1].network: …`). Cross-field
  rules (concurrency within the worktree pool, unique project ids, production
  environments never redeployed, issue type labels unique) are part of the schema.
- **`agent-factory init`** inspects a repository (package manager, lockfile, lint
  and test commands, test runner, default branch, forge remote) and writes a
  project entry, then validates the whole file. **`agent-factory validate`**
  checks the schema, the tools, the sandbox and, unless told otherwise, runs the
  gate preflight on a clean checkout; `--offline` stops after the schema.
- **Cockpit edits** rewrite matching scalars in place (comments, order and layout
  kept), after validating the whole edited file, and keep the previous file under
  the state directory.

## Consequences

- Adding a configurable capability means extending the zod schema, regenerating
  the JSON Schema and documenting the key in `docs/configuration.md`; CI fails
  when either is stale.
- A missing optional section has a documented default; a missing required value
  fails with its key path before the daemon starts.
