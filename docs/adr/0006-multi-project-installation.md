# ADR 0006: One installation, several projects

Status: accepted
Date: 2026-10-12

## Context

A factory is installed on one machine, logged in to one or more Claude accounts,
and watched by one operator. That operator works on several repositories. The
machine's memory, the subscription windows and the operator's attention are
shared by all of them; the repositories, their issues, their pull requests, their
worktrees and their delivery pipelines are not. Issue `#12` exists in every
repository, and so does the base branch `main`.

The use cases of the factory (the issue pipeline, the merge watcher, the release
gate, the request challenge) were written against ports bound to one repository:
a forge gateway without a repository argument, a worktree pool, an event log
whose subjects are `issue/12` or `release/v1.2.0`.

## Options

1. **Pass a project identifier through every use case and port.** Explicit, but
   touches every signature of the application layer and its tests, and makes every
   rule depend on a concept it does not need.
2. **One process per project.** No shared code changes, but the budget governor,
   the resource guard, the run ceiling and the cockpit would have to be shared
   between processes, which brings locking and a second protocol.
3. **One process, one runtime per project, composed around unchanged use cases.**
   Each project gets its own bundle of ports (forge, git, worktree pool, base
   checkouts, settings, prompts, knowledge, delivery, health) and a view of the
   event log scoped to it. Installation-level services (Claude accounts and usage,
   budget, resource guard, run ceiling, notifications, tool checks, settings) are
   built once and shared.

## Decision

Option 3.

- **Project identity.** A project has an `id` (`[a-z0-9-]`, unique in the
  installation, used in paths, URLs and event subjects) and a display `name`.
- **Event log.** One SQLite event log per installation. A `ProjectEventStore`
  decorator gives each project runtime a view in which `issue/12` is stored as
  `project/<id>/issue/12`: the use cases keep their subjects, reads never cross
  projects (the prefix always ends with a separator), and the global sequence
  numbers stay valid for the cockpit's live stream. Installation-level events
  (`budget/…`, `run/…`, `usage/…`, `settings`, `factory/…`) are written without a
  project prefix.
- **Runs.** Run identifiers are globally unique; a run carries its project in its
  payload, stamped by a `ProjectHarness` decorator around the shared harness.
- **Files.** Each project owns `projects/<id>/` under the installation home:
  clone, worktree pool, base checkouts, logs, evidence cache, requests,
  knowledge, and, in rehearsal mode, its local forge. Agent runs and confined
  commands of one project cannot read another project's directories.
- **Scheduling.** The daemon drives every project in each tick. Each project has
  its own issue concurrency, worktree pool, pauses and background slot (challenge
  or audit); `resources.maxConcurrentRuns` caps agent runs across the
  installation, and the resource guard and the budget governor admit or refuse
  every run, whatever its project. The operator can pause one project or the whole
  factory.
- **Cockpit.** Every view is scoped to the selected project, with an "all
  projects" board; installation-level views (costs, subscription usage, resources,
  tools, settings) show every project.

## Consequences

- The application layer stays project-agnostic and keeps its tests; the
  composition root and the storage decorator carry the project dimension, each
  covered by its own unit and integration tests.
- Cross-project issue dependencies are not expressible: a dependency names an
  issue of the same project.
- Deleting a project's state is deleting `projects/<id>/` and the events under
  `project/<id>/`.
