# ADR 0023: Reload the configuration live, and drain before a restart

Status: accepted
Date: 2026-10-12

## Context

Operators edit `config.yaml` by hand as well as from the cockpit, and some changes
need a restart. A restart in the middle of an agent run cut the agent short and left
an issue to resume, sometimes with an orphaned process.

## Options

1. **Read the file only at start.** A hand edit silently does nothing until the next
   restart, which the operator may not know is needed.
2. **Restart on every change.** Interrupts running work for a change that could have
   applied live.
3. **Watch the file, apply what can apply live, name what waits for a restart, and
   offer a drain** that stops new work and lets the factory exit once the running
   work is done.

## Decision

Option 3.

- The installation daemon watches `config.yaml`. A changed file is parsed and
  validated: when valid, roles, concurrency, budgets and resources apply at the next
  tick, and the settings that only a restart applies are listed; when invalid, the
  factory keeps the settings it has and records why the reload failed. The cockpit
  shows both, with the time. Settings changed from the cockpit go through the same
  path, with a backup of the previous file.
- `agent-factory stop` and the cockpit's drain record a drain: no new issue starts,
  running issues finish their current work, and the process exits once every project
  is idle, ready for a supervisor to start it again. `stop --now` stops the agents too.
  A drain left over from a previous process is lifted at start.

## Consequences

- An edit never takes effect silently half way: the cockpit says what applied, what
  waits for a restart and what was refused.
- A planned restart loses no agent run.
