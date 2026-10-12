# ADR 0016: Declare what confined code may reach beyond its worktree

Status: accepted
Date: 2026-10-12

## Context

ADR 0011 confines every agent run and every check command: no credential reads, no
writes outside the worktree and the caches, no network unless a step says why. Real
projects need a few deliberate exceptions, and each one weakens the confinement in a
way the operator must be able to see and choose:

- agents that pick a dependency version need to ask the package registry what exists,
  and the sandbox refuses the lookup;
- projects whose tests start their databases or services in containers need the
  container engine, both in the gate and in the agent's own shell;
- the built-in shell allowlist of the writing roles names JavaScript and Python
  tooling only (`npm run`, `uv run`, `mise run`); an agent of a Go, Rust or Java
  project cannot run the project's own commands.

## Options

1. **Hard-code more exceptions** (more registries, more tools). Every project pays for
   every other project's needs, and nobody can tell what a given run may reach.
2. **Let the orchestrator do lookups on the agents' behalf.** Needs a protocol between
   agent and factory for each kind of lookup, and still leaves containers and other
   stacks unsolved.
3. **Declared capabilities per project**, with the installation's `defaults` beneath:
   `sandbox.allowedDomains`, `sandbox.shellCommands` and `sandbox.docker`, applied to
   agent runs and check commands alike, and reported by `validate`.

## Decision

Option 3.

- `allowedDomains`: the hosts an agent's shell may reach through Claude Code's network
  proxy. Credentials stay unreadable, so a registry answers anonymous reads only.
- `shellCommands`: permission patterns such as `go test *` that the writing roles
  (acceptance author, implementer) may run. The project's own setup and gate commands
  are added automatically, so an agent can always run what the gate runs. Read-only
  roles keep no shell.
- `docker`: the container engine sockets present on the machine (Docker Desktop,
  Colima, OrbStack, Rancher Desktop, Podman, rootless Docker, or `DOCKER_HOST`) are
  opened to the agent's shell and to check commands; the writing roles may run
  `docker`. The socket is reachable even when its directory is a denied credential
  store, while the rest of that directory stays unreadable. Sockets are looked up
  again for every command, so an engine started after the factory is found.

`validate` reports each project's grants on a `sandbox` line. A `docker` grant names
its consequence there, in the example configuration and in the configuration
reference: a container can mount any directory the engine shares and reach any
network, so what runs through the engine is not confined. A grant without any engine
socket fails that line.

## Consequences

- An operator reads what a project's code may reach in its configuration and in
  `validate`, instead of discovering it from a refusal in a run log.
- A project granted the container engine trades the sandbox's guarantees for its tests'
  needs, knowingly. Projects without the grant keep the confinement of ADR 0011.
- On Linux, Claude Code's sandbox can open either every Unix socket or none, so an
  agent of a project granted the engine may also reach the other Unix sockets of the
  host; the check commands' bubblewrap sandbox still binds the engine sockets alone.
