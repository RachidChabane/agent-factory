# ADR 0018: Run the services acceptance checks need as a stack the factory owns

Status: accepted
Date: 2026-10-12

## Context

The checks of a user-interface issue drive the running application: a browser journey
needs the application served, and the application needs its database and the mocks of
the services it calls. The before and after screenshots of a pull request come from
those runs. Started by hand, or by a script inside the checks, such a stack outlives
the run that started it whenever that run is killed, holds its ports, and makes the
next run fail for a reason the change did not cause.

The factory already collects the files the acceptance command declares as evidence,
on the base and on the branch, and shows them side by side. What is missing is the
stack those runs need, started from the code under test and stopped afterwards.

Everything that depends on one product stays in that product's repository: how its
stack signs a user in, the identity it uses, the journeys and their decisions, films
recorded with real accounts. The factory runs the commands the project declares.

## Options

1. **Leave the stack to the checks.** Test runners can start servers, but a killed run
   leaves containers and processes behind, and the agent's own gate, run by its Stop
   hook, would start a second stack beside the first.
2. **Bracket the stack into each command line** (start; checks; stop). The factory no
   longer owns the processes, and a stop that never runs leaves them behind.
3. **A declared stack the factory owns**: `stack.setup` commands, long-running
   `stack.services` each with a `ready` command, `stack.teardown` commands, an
   `environment`, and the `issueTypes` that need it.

## Decision

Option 3, without any new stage or issue state: the stack wraps work that already
exists.

- **When.** The stack runs around the before-proof on the base, around each run of the
  acceptance author and of the implementer (whose Stop hook runs the gate inside it), and
  around the gate commands of the orchestrator's gate, after the setup commands.
- **How.** Setup commands run confined in the workspace under test. Each service starts
  confined, in a process group of its own with its output kept, and the factory waits
  until its `ready` command succeeds, within `readyTimeoutSeconds`. The work runs. Then
  the services stop (terminate, then kill after `stopGraceSeconds`), their output goes
  to the issue's logs as `stack-<service>.log`, and the teardown commands run, whatever
  the work did.
- **Side by side.** Every command inside a stack gets `AGENT_FACTORY_SLOT`, the lowest
  slot free among the issues of the project that run at once, from 0. A project derives
  its ports and compose project names from it.
- **Failure.** A stack that does not come up sends the issue to a person, with the
  failing command or the service that never answered and what it printed. Inside the
  orchestrator's gate it fails the gate with a `stack` step instead, so the implementer
  gets a correction like for any other failed step.
- **Crashes.** Each start and stop is an event of the issue. When a project's daemon
  starts, a stack started without a stop is reclaimed: each recorded service is stopped
  when it is still the same process (same id and start time), then the teardown runs.
- **Network.** On macOS the sandbox already lets confined commands reach the host's
  loopback. On Linux, bubblewrap gives each command its own network namespace, so the
  commands inside a stack share the host's network instead: on Linux they can reach the
  network, as a command granted it can, and the port filter of ADR 0011 does not apply
  to them.

## Consequences

- A project's stack is declared once and serves the before-proof, the agents and the
  gate the same way; the screenshots of both sides come from the same stack definition.
- The factory never leaves a stack running after it stops cleanly, and stops what a
  crash left behind at its next start.
- On Linux, a project that declares a stack trades the network isolation of its check
  commands for reaching its own services.
- The agents' own shell, confined by Claude Code's sandbox, reaches the stack only
  through the domains the project allows; the gate it runs reaches it directly.
