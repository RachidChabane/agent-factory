# Architecture

Agent Factory is one Node.js process per installation. It drives Claude Code agents
from a validated issue specification to a pull request that carries its own proof,
for every project of the installation, and serves the cockpit that shows and steers
that work.

## What runs

```text
agent-factory start
├── HTTP server ─────────── the cockpit (static files), its JSON API, an event stream
├── installation daemon ─── one loop for the whole machine
│   ├── tasks ──────────── subscription usage, config.yaml edits, health sampling,
│   │                       tool keep-alives
│   └── project daemons ── one per project: schedule validated issues, drive their
│                           pipelines, watch merges and releases, audit outside changes
└── agent runs ─────────── `claude` processes started by the pipelines, confined,
                            with the factory's hooks (packages/plugin)
```

Everything the factory does is an event appended to one SQLite event log
(`<home>/state`). Each project writes under its own subject prefix
(`project/<id>/…`), so one log serves every project and a project never reads
another's events. The cockpit's view, `agent-factory status` and every decision of
the daemons are projections of that log, plus readings of the forge and the machine
that carry the time they were read.

## Packages and the dependency rule

Dependencies point inward ([ADR 0005](adr/0005-layered-architecture.md)).

| Package | Holds | May import |
|---|---|---|
| `domain` | the model: issue and release lifecycles, issue types and proof strategies, budgets, retry and admission policies, the release gate | nothing |
| `application` | use cases and their ports: the issue pipeline and its stages, requests and their challenge, audits, releases, delivery, the daemons | `domain` |
| `adapters` | the ports' implementations: `gh` and the local forge, git, the Claude Code harness, the sandboxes, SQLite, notifications, tool probes, process supervision | `domain`, `application` |
| `plugin` | what runs inside an agent session: the Stop-hook gate, the guard of frozen checks, the role prompts. It is also a Claude Code plugin that adds the orchestrator agent and its skills to the operator's sessions ([ADR 0032](adr/0032-one-plugin-and-the-orchestrator.md)) | `domain` |
| `server` | composition: the configuration, the installation and project runtimes, the HTTP server, the command line, projections, the demonstration | all of the above |
| `cockpit` | the React cockpit and the contract (zod schemas) it shares with the server | `domain` |
| `fake-claude` | a deterministic stand-in for the `claude` CLI that plays a scenario file | nothing |

Business rules are tested without a forge, a model, a network or a framework: the
application's tests run the whole pipeline against in-memory fakes of its ports.

## The cycle of an issue

The cycle is the one the operator validated ([ADR 0009](adr/0009-development-cycle.md));
the factory adds no step to it.

| State | Stage | What happens |
|---|---|---|
| `spec-draft` → `spec-validated` | the operator | a draft issue (written by a person, or proposed by the challenge of a request and accepted) is validated by the operator's gesture |
| `authoring-checks` | acceptance author | an agent writes checks that prove each criterion from the outside and the manifest that names them |
| `checks-frozen` | before-proof | the checks run on the base and must fail there by assertion; they are frozen by hash |
| `implementing` | implementer | one agent implements, with no instruction to verify itself; its Stop hook runs the gate (frozen hashes, lint, tests) and holds the run until it passes |
| `gating` | orchestrator gate | the factory runs the gate again in its own sandbox |
| `reviewing` | reviewer | an agent in a fresh context reviews the change against the spec and the checks |
| `producing-evidence` | evidence | the factory commits the before and after evidence, pushes, and opens the pull request |
| `pr-open` → `closed` | the operator | the merge happens on the operator's order: squash, after the evidence folder is removed |

Failures retry within bounds: two corrections in the same session, then one fresh
restart, then `needs-human` with the reason. A decision only a person can take
stops the run and comes back to the agent with the answer.

## Ports and adapters

| Port (application) | Adapter (adapters) |
|---|---|
| `GitHubGateway` | `GhCliGateway` (GitHub through `gh`), `LocalGitHubGateway` (a bare repository and files: the rehearsal forge, [ADR 0010](adr/0010-forge-port.md)) |
| `AgentHarness` | `ClaudeCodeHarness`: the `claude` CLI in stream-JSON, with generated settings, hooks and permissions |
| `CommandSandbox` | `SeatbeltCommandSandbox` (macOS `sandbox-exec`), `BubblewrapCommandSandbox` (Linux `bwrap`), [ADR 0011](adr/0011-command-confinement.md) |
| `WorktreePool`, `SourceControl`, `BaseCheckouts` | git worktrees of the project's clone, one queue of ref-changing operations per clone |
| `ReferenceSnapshots` | `GitReferenceSnapshots`: the files of a local clone at a tag or a commit, extracted read-only into the project's directory ([ADR 0031](adr/0031-reference-repositories.md)) |
| `ServiceProcesses` | `SpawnServiceProcesses`: the long-running services of a stack, each in its own process group ([ADR 0018](adr/0018-factory-owned-stacks.md)) |
| `EventStore`, `IssueStateStore` | SQLite |
| `UsageReportSource` | `claude -p /usage` per account ([ADR 0012](adr/0012-subscription-usage-source.md)) |
| `Notifier` | system notifications, Slack, Google Chat, a generic webhook ([ADR 0013](adr/0013-notification-channels.md)) |
| `ToolProber`, `ToolSessionCommands` | the declared checks, logins and keep-alives of the connected tools ([ADR 0014](adr/0014-declarative-tool-checks.md), [ADR 0017](adr/0017-tool-logins-and-session-keepers.md)) |
| `ResourceGuard` | memory and memory pressure of the machine |

## The cockpit

The cockpit is a React application built by Vite and served by the factory. It
loads one snapshot (`GET /api/state`), follows an event stream (`GET /api/events`,
server-sent events) that carries factory events, run logs and telemetry, and
reloads the snapshot after each event and every 30 seconds. It acts only through
commands (`POST /api/commands/<name>`), each validated by the shared contract, each
answering with the event it recorded and its effect in words; the page carries a
per-process token that every command must present.

The contract (`packages/cockpit/src/contract`) is the single definition of what
crosses the wire: the server's projections parse their output with it in tests, and
the cockpit parses what it receives.

## Confinement

- Agent runs: Claude Code's own sandbox and permission settings, generated per run
  with the deny lists of credentials, other projects and the factory's state.
- Setup, gate and acceptance commands: the operating system's sandbox, no credential
  reads, writes limited to the worktree and the caches, no network unless a command
  declares why it needs it, and the factory's own ports refused.
- What a project may open beyond that is declared: domains for agents' shells,
  extra shell commands, the container engine
  ([ADR 0016](adr/0016-declared-sandbox-capabilities.md)), and a stack of services
  around the checks ([ADR 0018](adr/0018-factory-owned-stacks.md)).
- What a specification cites in another repository is read from a snapshot of the
  files at the cited tag or commit, never from the repository itself
  ([ADR 0031](adr/0031-reference-repositories.md)). Every role of the project reads its
  snapshots, in Claude Code's own sandbox and in the operating system's sandbox of the
  commands; the acceptance author and the implementer copy from them with `cp` and
  `cp -R`; nothing writes to one, and no other project reads them.

## A factory home

```text
~/.agent-factory/            (or $AGENT_FACTORY_HOME)
├── config.yaml              the installation and its projects
├── state/                   the event log, configuration backups, the process lock
├── runs/                    one directory per agent run: settings, prompts, logs
├── logs/                    the installation's logs
├── cache/                   caches the confined commands may write
└── projects/<id>/
    ├── clone/               the factory's clone of the repository
    ├── worktrees/           one worktree per running issue
    ├── checkouts/           clean checkouts for audits and preflights
    ├── evidence/            the evidence of each issue, served to the cockpit
    ├── requests/            product requests and their attachments
    ├── knowledge/           the project's knowledge pack
    ├── references/          read-only snapshots of the repositories its specifications cite
    ├── logs/                gate, before-proof and stack logs per issue
    └── forge/               the local forge of a rehearsal project
```

## Tests

| Level | Where | What it proves |
|---|---|---|
| Unit and property | every package (`*.test.ts`, fast-check) | domain rules, parsers, projections, renderers |
| Integration | `adapters`, `server` | real git, real processes, the real sandboxes (`*.real.test.ts`), SQLite |
| Contract | `server/src/http/*.e2e.test.ts` | the server's snapshot and stream parse with the cockpit's schemas |
| End to end | `script/e2e-example`, `script/e2e-cockpit` | the example project from spec to merge through the command line; every cockpit command clicked against a running factory |

No test needs a model, an account or the network: agent runs use `fake-claude`,
forges are local.
