# ADR 0010: One forge port, a GitHub adapter and a local rehearsal forge

Status: accepted
Date: 2026-10-12

## Context

The factory reads issues, opens pull requests, reads check runs and deployments,
dispatches workflows and merges on the operator's order. Each project names its
forge. Two needs pull in different directions: production work happens on GitHub,
while a rehearsal must run the whole cycle on a real repository without writing a
single byte to the remote forge. Other forges (GitLab first) must stay possible
without touching the use cases.

## Options

1. **Call `gh` and `git` from the use cases.** Fast to write; ties every rule to
   GitHub and makes rehearsal impossible without a fake GitHub.
2. **A GitHub REST client library.** Adds a dependency and an authentication story
   of its own, while operators already have an authenticated `gh`.
3. **One port in the application layer, with adapters at the edge:** a GitHub
   adapter that shells out to `gh` and `git`, and a local adapter backed by a bare
   mirror and issue files.

## Decision

Option 3.

- The port speaks the forge's concepts, not GitHub's endpoints: issues with
  labels and blocking links, change requests (pull requests, merge requests),
  check runs, deployments, workflow dispatches, releases and tags, and merges with
  an expected head commit.
- The **GitHub adapter** runs `gh` with the operator's login and `git` with the
  project's commit identity. It never runs a command against a repository other
  than the project's own, and it refuses a remote that is not the configured one.
- The **local adapter** (`forge.kind: local`) is a rehearsal forge: a bare
  repository created with `git clone --mirror` from a source clone, issues stored
  as Markdown files with front matter, pull requests as records next to them, and
  check runs either absent or produced by running the project's own gate locally.
  Nothing is sent to a remote forge; the source clone is only read.
- A GitLab adapter is a new adapter behind the same port. The use cases, the
  cockpit contract and the configuration schema only name `forge.kind`.

## Consequences

- Every use case is testable with an in-memory forge, and every pull request flow
  can be rehearsed end to end on a copy of a real repository.
- `gh` is a built-in connected tool for GitHub projects only; a local project needs
  `git` alone.
- Features that exist on one forge only (GitHub deployment environments, for
  instance) are optional capabilities of an adapter; the cockpit shows them as
  unavailable rather than empty when the project's forge lacks them.
