# ADR 0032: One plugin carries the factory's roles and the orchestrator that drives it

Status: accepted
Date: 2026-10-12

## Context

Two kinds of agents work with the factory.

- **Inside** it, each run plays one role: the acceptance author, the implementer, the
  reviewer, the challenger or the auditor, held by the hooks of ADR 0027.
- **Around** it, someone plays the operator's part. That part covers:
  - turning a request into specs whose criteria the repository's tooling can check,
    and creating the issues with their dependencies;
  - validating them when the operator delegates it;
  - watching for what blocks, unblocking escalations and merging what needs no
    judgement;
  - upgrading the factory at a quiet moment and reporting to the operator.

An agent session can play the part around the factory. Left ad hoc, every session
rediscovers the commands, the spec rules and the conventions, and acts on the factory
in its own way.

## Options

1. **Leave the part around the factory to ad hoc sessions.**
2. **A separate plugin for the orchestrator.** Its version would drift from the
   factory's and from the commands it drives.
3. **One plugin for both.** It carries the run roles and hooks, which the factory uses
   per run, and the orchestrator agent and its skills, which the operator installs in
   Claude Code.

## Decision

Option 3. `packages/plugin` is a Claude Code plugin, and the repository is its
marketplace (`.claude-plugin/marketplace.json`).

- **What runs inside.** The role prompts (`roles/`) and the hooks (`hooks/`) are loaded
  by the factory for each run as ADR 0027 decides: per run, without the operator's
  plugins. The plugin declares no hooks of its own. Installing it changes no session
  besides adding the agent and the skills.
- **What works around.** `agents/orchestrator.md` defines the orchestrator, usable as
  the main agent of a session (`claude --agent agent-factory:orchestrator`) or as a
  subagent. Its skills each hold one procedure:
  - write a spec;
  - declare films;
  - triage an escalation;
  - merge and release;
  - write the operator's morning report;
  - watch the factory;
  - drive the factory from its command line;
  - upgrade the factory at a quiet moment.
- **One way to act.** The orchestrator acts on the factory only through its command
  line, never by editing the factory's files, its event log or the forge directly. It
  watches through `agent-factory watch`. This command polls the running factory and
  prints only the transitions that block work. Its output is deterministic, so a
  session that holds the context reacts to each line. The factory's own notifications
  cover the operator when no session runs.
- **One version.** The plugin's version is the factory's. The release script sets both.

## Consequences

- An operator gets the orchestrator with `/plugin marketplace add` and `/plugin install`.
  It knows the commands of the factory it was released with.
- The skills state rules and commands only. What the orchestrator may decide alone is
  the factory's to enforce (ADR 0033), not the skills' to promise.
- The run roles and hooks stay where the factory expects them. A factory run never
  depends on what the operator installed.
