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
│   ├── films ──────────── one queue for every project, one film at a time
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

A film is evidence added to an open pull request, not a stage
([ADR 0030](adr/0030-films.md)). Once the pull request is open, the factory orders the
scenarios the spec declares; the installation's daemon films them one at a time, across
projects, while nothing else runs: the base, then the head, committed on the branch in
one evidence commit and announced in the pull request body. The merge waits for the
films of its pull request.

Once per head of an open pull request, the project daemon tells the operator that it is ready
([ADR 0034](adr/0034-notification-media.md)): its required checks passed, by the rule that gates its
merge, and none of its films is queued or recording; a failed film holds the notice. The scan runs
beside the daemon's tick and never holds it. It uploads the films, their final screenshots and the
evidence images with the operator's command, at most once per content, and records the notice with the
links it carried. A failed upload leaves its link out; the notice still goes out.

The operator's gestures are the ones the cycle waits on: validating a spec, answering a decision,
resuming an issue, merging a pull request. A project may delegate them to an orchestrator
([ADR 0033](adr/0033-autonomy-policy.md)). The command line takes `--as <actor> --reason "<why>"` on those
gestures; the `AutonomyGate` checks the project's policy before anything else is read or written, refuses
what it does not delegate, and records each gesture it accepts on the issue with its actor, reason and the
rule that allowed it. The delegate's own events carry its name too, and a merge keeps every guard it has.
The policy is not a security boundary: the delegate runs with the operator's account.

Failures retry within bounds: two corrections in the same session, then one fresh
restart, then `needs-human` with the reason. The bounds count the failures of one
cycle: the operator's feedback on a pull request, the answer to a decision and a
rewritten check each open a cycle with the whole budget. A decision only a person can
take stops the run and comes back to the agent with the answer.

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
| `FilmRecorder`, `VideoTranscoder` | `CommandFilmRecorder` runs the project's film command; `FfmpegTranscoder` turns a video that is not an MP4 into H.264 ([ADR 0030](adr/0030-films.md)) |
| `MediaUploader`, `MediaLinkCache`, `FileFingerprints` | `CommandMediaUploader` runs the upload command the operator declares and reads the link it prints; `FileMediaLinkCache` keeps the links by the SHA-256 of the file's content in the state directory; `Sha256FileFingerprints` ([ADR 0034](adr/0034-notification-media.md)) |

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

How the cockpit loads, caches and shares its stream:

- **One document load.** Menu entries are router links: moving between views never
  reloads the document, never fetches the snapshot again and never reopens the event
  stream. A view is a lazy chunk, fetched once.
- **One snapshot, one stream per browser.** A tab fetches the snapshot once, then opens
  `GET /api/events?after=<snapshot sequence>`; after a disconnection it reconnects
  with `after=<last applied sequence>`, and the history is never replayed from the
  start. The tabs of one browser elect a leader through a Web Lock: the leader holds
  the only event stream and relays its frames to the other tabs over a
  BroadcastChannel, and a waiting tab takes over when the leader closes. A browser
  serves six HTTP/1.1 connections per host, so a stream per tab would leave the
  seventh tab without a connection. A browser without locks or channels keeps one
  stream per tab.
- **The snapshot never waits on a forge.** Every reading of something outside the log is
  cached with the time it was read. A value past its interval is served at once, with
  its old read time, and read again behind the request, one read per key at a time and
  every key concurrently. A reading nobody has completed, or that an event outdated, is
  waited for at most three seconds; past that the snapshot carries it empty (`null`,
  never a stand-in) and the read ends in the background. The factory builds the first
  snapshot as it starts.
- **Errors never blank the page.** Every view and the application sit in an error
  boundary that shows the message with a retry. A lazy chunk that fails to load offers
  a document reload, because the browser caches a rejected dynamic import.
- **Cache policy.** Files under `/assets/` carry a content hash and are
  `public, max-age=31536000, immutable`; a missing path under `/assets/` answers 404,
  never the page. The HTML shell and every JSON answer are `no-store`. Other static
  files, evidence and attachments are `no-cache` with a weak `ETag` and answer `304`
  while it matches. Source maps are built hidden: the bundle does not reference them.

## Confinement

- Agent runs: Claude Code's own sandbox and permission settings, generated per run
  with the deny lists of credentials, other projects and the factory's state.
- Film commands and the upload command of the notices: the commands the factory runs outside the
  sandbox, with the operator's environment, in the factory itself, under `nice`, and in a process
  group stopped on timeout and on stop ([ADR 0030](adr/0030-films.md), [ADR 0034](adr/0034-notification-media.md)).
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
  commands, and each run opens them as added directories of its session; the acceptance
  author and the implementer copy from them with `cp` and `cp -R`, after `mkdir -p` for
  a missing destination directory; nothing writes to one, and no other project reads them.

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
