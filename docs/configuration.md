# Configuration reference

One file, `config.yaml`, configures an installation and its projects. It lives in the
factory home: `~/.agent-factory/config.yaml`, or `$AGENT_FACTORY_HOME/config.yaml`.

- `agent-factory init` inspects a repository and writes or extends the file.
- `agent-factory validate` checks it; `--offline` checks the file alone, without
  running any command.
- `agent-factory schema` prints its JSON Schema, also at
  [`schema/config.schema.json`](../schema/config.schema.json); the first line of the
  example tells YAML editors where to find it.
- [`config/config.example.yaml`](../config/config.example.yaml) shows every section.

Relative paths resolve against the factory home (a project's paths against its own
directory, `projects/<id>/`); `~/` resolves against your home directory. Secrets are
never written in the file: `{ fromEnvironment: NAME }` names the environment variable
that holds one. Durations are in the unit their name says (`timeoutMinutes`,
`wakeUpSeconds`). A hand edit is picked up while the factory runs: what can apply live
applies at the next tick, and the cockpit lists what waits for a restart.

## Installation

| Key | Default | Meaning |
|---|---|---|
| `version` | required, `1` | the version of the file's format |
| `server.host` | `127.0.0.1` | the address the cockpit and its API listen on |
| `server.port` | `7430` | their port; `0` picks a free one |
| `server.publicUrl` | `http://<host>:<port>` | the address notifications link to |
| `server.remoteAccess` | `{ kind: none }` | `none`: the machine only. `tailscale`: through `tailscale serve`, each request carrying the login Tailscale sets; `allowedLogins` restricts who gets in |
| `claude.command` | `[claude]` | how to start the Claude Code CLI |
| `claude.niceness` | `10` | the `nice` level of agent runs; `null` for none |
| `claude.writableDirectories` | `[]` | directories agent runs may write besides their worktree |
| `claude.accounts` | `[]` | Claude logins: `name`, `configDir` (its `CLAUDE_CONFIG_DIR`), `billing` (`subscription` or `api-key`). Without any, agent runs use the default login |
| `claude.usage.refreshMinutes` | `10` | how often the subscription usage is read (it costs no usage) |
| `claude.usage.staleAfterMinutes` | `30` | when a reading counts as stale |
| `budget.pauseAt.session` | `0.9` | no agent run starts on an account past this share of its session limit |
| `budget.pauseAt.weeklyAll` | `0.85` | the same for the weekly limit of all models |
| `budget.pauseAt.weeklyScoped` | `0.85` | the same for each weekly limit of one model |
| `budget.dailyCapUsd` | `none` | `none`, or API-equivalent dollars per UTC day after which no run starts |
| `budget.perRunCapUsd` | `none` | `none`, or a ceiling on any single run's budget |
| `resources.minimumFreeMemoryPercent` | `40` | no agent run starts below this share of free memory |
| `resources.pauseAbovePressure` | `normal` | `normal` or `warn`: the memory pressure above which no run starts |
| `resources.maxConcurrentRuns` | `1` | agent runs at once, across every project |
| `daemon.pollIntervalSeconds` | `30` | how often the daemon looks for work |
| `daemon.mergeWatchIntervalMinutes` | `10` | how often merged and outside changes are read from the forges |
| `daemon.issueRefreshSeconds` | `120` | how often the forges' issues are read |
| `notifications.channels` | `[]` | `system`, `slack` (`webhookUrl`), `google-chat` (`webhookUrl`), `webhook` (`url`, `headers`); secrets as `{ fromEnvironment: NAME }` |
| `notifications.dedupeWindowMinutes` | `30` | identical notices within this window are sent once |
| `tools` | `[]` | the tools of the whole installation; see [Tools](#tools) |
| `defaults.roles` | see [Roles](#roles) | the roles of every project that does not set its own |
| `defaults.sandbox` | see [Sandbox](#sandbox) | the sandbox settings under every project's own |
| `defaults.environment` | see [Environment](#environment) | the variables of check commands when a project sets none |
| `projects` | required | at least one project |

## Project

| Key | Default | Meaning |
|---|---|---|
| `id` | required | lowercase letters, digits and dashes; used in paths, subjects and links |
| `name` | required | the name the cockpit shows |
| `forge` | required | `{ kind: github, repository: owner/name, mergeWithBypass: false }` or `{ kind: local, repository, directory: forge, checks: none \| gate }`; see [Forges](#forges) |
| `baseBranch` | `main` | the branch work starts from and merges into |
| `clone` | `clone` | where the factory keeps its clone, in the project's directory |
| `commitIdentity` | required | `name` and `email` of the factory's commits |
| `conventions.branchPrefix` | `factory/` | the prefix of the branches of issues |
| `conventions.labels` | see meaning | the labels the factory reads and writes: `factory` (`factory`), `validated` (`spec:validated`), `audit` (`audit`), `typePrefix` (`type:`), `kindPrefix` (`kind:`) |
| `conventions.defaultScope` | `repo` | the Conventional Commit scope when the issue type gives none |
| `worktrees.size` | `3` | worktrees kept for running issues |
| `concurrency.issues` / `ceiling` | `1` / `3` | issues of this project at once, and the most the operator may raise it to (never above `worktrees.size`) |
| `setup` | `[]` | commands that prepare a worktree (installs); `{ name, run, network?: <why> }` |
| `gate.beforeAcceptance` / `afterAcceptance` | `[]` | the gate's commands around the acceptance checks |
| `gate.timeoutMinutes` | `30` | the bound of each gate command |
| `gate.niceness` | `10` | the `nice` level of setup and gate commands; `null` for none |
| `environment` | the installation's | the variables of setup, gate and acceptance commands; see [Environment](#environment) |
| `stack` | none | services the checks need, run by the factory; see [Stack](#stack) |
| `sandbox` | the installation's | see [Sandbox](#sandbox) |
| `secretScan.keychainServices` | `[]` | keychain items whose values the factory looks for in what it is about to push, refusing the push when one appears |
| `issueTypes` | the presets | see [Issue types](#issue-types) |
| `roles` | the installation's | overrides per role; see [Roles](#roles) |
| `prompts` | the built-in prompts | a file per role whose text replaces the built-in prompt |
| `knowledge` | `[]` | sources of the knowledge pack given to agents: `{ path }` (a file or directory) or `{ repository: <path in the repo> }` |
| `references` | `[]` | other repositories the specifications cite, read as snapshots: `{ name, repository, ref, source }`; see [References](#references) |
| `evidence.maxFileBytes` / `maxTotalBytes` | 5 MB / 40 MB | limits of the evidence committed to a pull request |
| `delivery` | none | see [Delivery](#delivery) |
| `audits.ignore` | `[]` | other automations of the repository: `{ name, branches?: [globs], authors?: [globs] }`; their changes are recorded, not audited |
| `tools` | `[]` | the tools of this project; see [Tools](#tools) |

A command's `network` is the reason it needs the network; without it, the command runs
with none.

### Forges

- `github`: the repository on GitHub, read and written through `gh` with the
  operator's login. Issues, pull requests, checks, deployments and tags come from
  there. `mergeWithBypass: true` merges with the administrator bypass
  (`gh pr merge --admin`), for an operator the base branch's rules let bypass the
  required review; the merge still happens only on the operator's order and only at the
  head they reviewed.
- `local`: a bare repository and plain files in the project's directory, for a
  rehearsal that never reaches a remote. `agent-factory rehearsal init <clone>`
  creates it from an existing clone. With `checks: gate`, the forge runs the project's
  setup and gate commands on each commit of a pull request, one commit at a time, and
  reports a check per step.

### Environment

`environment.passthrough` (default `PATH`, `HOME`, `LANG`, `TERM`, `TMPDIR`, `USER`)
lists the variables of the factory's environment that reach confined commands;
`environment.set` adds fixed ones. A name that looks like a credential (`TOKEN`,
`SECRET`, `GH_`, `AWS_` …) is refused: credentials never reach check commands or agent
runs.

### Issue types

Each type has an `id`, an optional `label` (default `type:<id>`), a `proof`, and a
`commit` rule:

| Key | Meaning |
|---|---|
| `proof` | `fails-on-base`: the checks must fail on the base by assertion. `fails-on-base-when-expressible`: the same when the change can be checked at all. `base-score`: an evaluation scored on the base, to beat on the branch. `none`: no checks |
| `checks` | what the acceptance author writes for this type, in words |
| `commit.type`, `commit.scope` | the Conventional Commit type and scope of the change |
| `commit.whenChanged` | `[{ paths: [globs], type }]`: the first rule whose globs match a changed path decides the type |
| `evidence` | what the pull request shows: `acceptance-tests`, `screenshots`, `score`, `diff-stat` |
| `review` | extra angles of the review: `security` |
| `paths` | globs that suggest this type for a change found by an audit |

Without `issueTypes`, the presets apply: `feature`, `fix`, `ui`, `api`, `security`, `data`,
`dependencies`, `docs`, `refactor` and `release`.

### Roles

`acceptance-author`, `implementer`, `reviewer`, `challenger` and `auditor` each take
`model`, `effort` (`low`, `medium`, `high`, `xhigh`, `max`), `maxBudgetUsd`, `maxTurns`
and `timeoutMinutes`; the implementer also takes `escalation: { model, effort }`, used
for its fresh restart. By default every role runs on Opus; the implementer starts at
`low` effort and escalates to `high`. A project's `roles` override single fields.

### Sandbox

| Key | Meaning |
|---|---|
| `deniedReadPaths` | paths no agent and no command may read, besides the built-in credential stores |
| `writableDirectories` | directories confined commands may write besides their worktree (default: the platform's package caches) |
| `shellCommands` | extra shell commands the writing agents may run, as patterns such as `go test *`; the project's setup and gate commands are always allowed |
| `allowedDomains` | hosts the agents' shell may reach, such as a package registry |
| `docker` | `true` lets agents and commands drive the machine's container engine. A container can mount any directory the engine shares and reach any network: what runs through the engine is not confined |

`agent-factory validate` reports each project's grants on its `sandbox` line.

### References

A specification sometimes cites another repository at a given version: the legacy
application at its production tag, a library whose interface the change must follow
([ADR 0031](adr/0031-reference-repositories.md)). Agents and check commands have no
network, so the factory gives them a read-only snapshot of its files instead.

| Key | Meaning |
|---|---|
| `name` | lowercase letters and digits in groups separated by single hyphens; unique in the project |
| `repository` | the `owner/name` the specifications cite |
| `ref` | a tag or a commit id of the clone at `source` |
| `source` | the path of a local clone that holds the ref |

`agent-factory start` and `agent-factory validate` extract the files at `ref` (`git archive`,
without `.git`) into `projects/<id>/references/<name>@<ref>/`, and record the commit the ref
resolves to in `<name>@<ref>.commit` beside it. A snapshot is rebuilt only when it is missing
or the ref resolves to another commit, and the previous one stays until the new one is
complete. When `source` does not hold the ref, `start` refuses to start and `validate` fails
the project's `reference <name>` line, both naming `git -C <source> fetch --tags`. The
commands that may run an agent (`run-issue`, `request challenge`, `audit`, `pr-feedback`)
bring the snapshots up to date first, the same way.

Every role of the project reads its snapshots, in Claude Code's own sandbox and in the
operating system's sandbox of setup, gate and acceptance commands; no role writes to one.
The acceptance author and the implementer may also run `cp <snapshot>/<file> <destination>`
and `cp -R <snapshot>/<directory> <destination>`. The files of a snapshot have no write
permission and a copy keeps that mode. Each run's prompt lists the project's snapshots with
their repository, ref, commit and path, and the cockpit's project settings list them with their
ref, the commit it resolved to, the state of the snapshot (ready, ref missing from the
source, not built) and when it was read. Another project never reads them.

### Stack

What the acceptance checks need running, owned by the factory
([ADR 0018](adr/0018-factory-owned-stacks.md)):

| Key | Default | Meaning |
|---|---|---|
| `setup` | `[]` | commands that bring what the services need up, then return |
| `services` | `[]` | `{ name, run, ready, readyTimeoutSeconds: 120, network? }`: a long-running command and a command that succeeds once it answers |
| `teardown` | `[]` | commands that bring the setup down; they always run |
| `environment` | `{}` | variables of every command inside the stack |
| `issueTypes` | every type | the issue types whose checks need the stack |
| `stopGraceSeconds` | `10` | how long services get to stop before they are killed |

Every command inside a stack gets `AGENT_FACTORY_SLOT` (0, 1, …), so the stacks of
issues that run at once can use distinct ports.

### Delivery

| Key | Meaning |
|---|---|
| `release` | `{ kind: release-please }`, `{ kind: tags, tagPattern }` or `{ kind: none }` |
| `environments[].name` | the environment's name |
| `environments[].promotion` | `automatic`, `batch` or `manual` |
| `environments[].production` | whether it is production; the factory never deploys production |
| `environments[].deployments` | `{ kind: github, environment: <GitHub environment> }` or `{ kind: none }` |
| `environments[].health` | `[{ name, url }]`, sampled every `healthIntervalMinutes` (default 5) |
| `environments[].wakeUpSeconds` | how long a release gate waits for a scaled-to-zero environment (default 90) |
| `environments[].redeploy` | `{ workflow, inputs }` dispatched on the operator's order; `{{target}}` and `{{version}}` are replaced. Refused on production |
| `environments[].workflowUrl` | the page of the workflow a person runs to deploy it |

### Tools

Each tool is checked by a read-only command, shown in the cockpit and run by
`validate`:

| Key | Default | Meaning |
|---|---|---|
| `name` | required | lowercase letters, digits and dashes |
| `description` | none | what the tool is used for |
| `check` | required | the command that succeeds when the tool is installed and logged in |
| `version` | none | the command that prints its version |
| `connectedPattern` | none | a regular expression the check's output must match |
| `fix` | none | what to run when the check fails, shown to the operator |
| `install` | none | how to install it |
| `timeoutSeconds` | `20` | the bound of the check |
| `login` | none | a login that needs no terminal, started by the cockpit's Log in button and `agent-factory tool login <name>` |
| `loginTimeoutSeconds` | `300` | its bound |
| `keepAlive` | none | `{ command, everyMinutes, timeoutSeconds: 120 }`, run by the factory to keep the session alive |

Logins and keep-alives run as the operator would from a terminal, without one; what
they print is never kept.
