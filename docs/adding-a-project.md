# Add a project

A project is one repository the factory works on. An installation holds as many as
you like; each has its own clone, worktrees, issues, settings and cockpit pages.

## 1. Let `init` inspect the repository

```sh
cd path/to/your/repository
agent-factory init                     # GitHub, from the repository's origin
agent-factory init --forge local       # a rehearsal on a local forge, nothing reaches GitHub
```

`init` reads the repository and writes a project entry to `config.yaml` (creating the
file when there is none), checked against the configuration's schema:

- the GitHub repository from `origin`, the default branch, and the commit identity
  from the repository's git configuration;
- setup and gate commands from what the repository already uses, in this order: its
  `script/` front doors (`script/setup`, `script/lint`, `script/test`), the tasks of
  its `mise.toml`, its Makefile targets, or its stack's usual commands (Node.js,
  Python, Go, Rust, Maven, Gradle), with the reason each install needs the network;
- the release model (release-please, tags or none) and the other automations whose
  changes the factory should record without auditing them (Dependabot, Renovate).

Options: `--id`, `--name`, `--force` to replace an entry with the same id. Review what
it wrote: it is a starting point, not a verdict.

## 2. Check the gate on a clean checkout

```sh
agent-factory validate
```

`validate` clones the repository into the factory home and runs every setup and gate
command on a clean checkout of the base, confined as the factory will run them. A
command that needs the network without saying why fails with the reason: add
`network: <why>` to it. A gate that does not pass on the base cannot prove anything
on a branch; fix it first.

## 3. Describe the kinds of work

`issueTypes` decides, for each `type:` label, what proof the factory demands and how
the commit is named. The presets cover most repositories; adapt them when your
repository has its own kinds of work (an evaluation of a prompt that must score
better, an infrastructure change checked by a policy script). See
[the configuration reference](configuration.md#issue-types).

## 4. Give the agents what they need, and no more

- **Knowledge**: `knowledge` points at the documents agents should read: architecture,
  constraints, the product, its users.
- **References**: when specifications cite another repository at a version (the legacy
  application at its production tag), `references` gives every agent of the project a
  read-only snapshot of its files, taken from a local clone, and lets the writing
  agents copy from it. `agent-factory validate` builds the snapshots and names the
  `git fetch --tags` that brings a missing tag in.
- **Shell**: agents may always run the project's setup and gate commands; add others
  with `sandbox.shellCommands` (`go test *`, `npm view *`).
- **Network**: `sandbox.allowedDomains` for read-only lookups (a package registry).
- **Containers**: `sandbox.docker: true` only when the gate needs them, knowing that
  what runs through the engine is not confined.
- **A running application** for user-interface checks: a `stack` the factory starts
  around the checks (a database, the application on a port derived from
  `AGENT_FACTORY_SLOT`), with a `ready` command per service.
- **Roles**: every role runs on Opus by default; adjust a role's effort, budget or
  turns per project, or replace its prompt with `prompts.<role>`.

## 5. Connect the tools and the delivery

- `tools`: read-only checks of the command-line tools your work relies on, with the
  login to start from the cockpit and a keep-alive when sessions expire.
- `delivery`: the release model, the environments with their promotion policy,
  deployment source and health checks. Production is never deployed by the factory.

## 6. Rehearse before going live

```sh
agent-factory init --forge local --id my-project-rehearsal
agent-factory --project my-project-rehearsal rehearsal init path/to/a/clone
agent-factory --project my-project-rehearsal issue create spec.md --start
agent-factory start
```

A local forge is a bare repository and plain files in the factory home. The factory
runs the whole cycle against it, with your real gate, and nothing reaches GitHub.
`rehearsal reset` puts the forge back to the clone's state. When the rehearsal goes
from spec to merge the way you expect, switch the forge to `github`.

## 7. Start

```sh
agent-factory validate
agent-factory start
```

The project appears in the cockpit's project switcher. Its issues wait as drafts
until you validate them.
