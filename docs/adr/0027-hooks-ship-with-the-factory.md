# ADR 0027: The agents' hooks ship with the factory, not as a separate plugin

Status: accepted
Date: 2026-10-12

## Context

What runs inside an agent session (the Stop-hook gate, the guard of frozen checks,
the role prompts) could be distributed as a Claude Code plugin, for example through a
plugin marketplace, and installed into the operator's Claude configuration.

## Options

1. **A marketplace plugin** the operator installs. Its version could drift from the
   factory's, and it would load in every session of the operator, not only the
   factory's runs.
2. **Ship the hooks with the factory** and inject them per run through the settings
   the factory generates for that run.

## Decision

Option 2. `packages/plugin` holds the hooks and the role prompts; the factory writes a
settings file per run that points at the hooks of the installed factory, with the
run's gate policy, and starts `claude` with it and with the project's own settings
only: the operator's user settings and plugins do not load in a factory run. Nothing
is installed into the operator's Claude configuration, and the agent cannot edit the
project's `.claude` settings files during the run.

## Consequences

- The hooks always match the factory that runs them.
- The plugin is not distributed on its own; a marketplace entry would describe the
  factory as a whole, not its hooks.
