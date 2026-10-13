---
name: drive-factory
description: Find the agent-factory verb, option and cockpit address for what you need to do. Use before running a command you have not run in this session.
---

# Drive the factory

`agent-factory` is `script/factory` in the factory's clone, or `agent-factory` where it is on the PATH. `agent-factory help` prints every verb. An installation with several projects needs `--project <id>` on every command that acts on one project, anywhere on the line.

## Verbs

| Group | Command | Does |
|---|---|---|
| Health | `agent-factory status [<issue>]` | the installation at a glance (process, pauses, usage, issues by state per project), or one issue |
| | `agent-factory usage [--refresh]` | each account's subscription limits with their reset times; `--refresh` reads them now |
| | `agent-factory validate [--offline] [--skip-gate-preflight]` | checks the configuration, the tools, each project's forge, labels, sandbox grants, worktrees and gate |
| | `agent-factory tool check <name>` | checks a connected tool now |
| | `agent-factory tool login <name>` | starts the login the tool declares, then checks it |
| Run | `agent-factory start [--port <port>]` | runs the factory and serves the cockpit; it does not return until the factory stops |
| | `agent-factory stop [--now]` | drains: no new work, exit once running work is done; `--now` also stops the agents |
| | `agent-factory watch [--interval <seconds>] [--once] [--all] [--json] [--port <port>]` | prints each blocker as it appears or clears since the last watch reported; `--all` prints every blocker present; `--once` reads once and records nothing |
| | `agent-factory run-issue <issue>` | drives a validated issue by itself; refused while the factory runs |
| Work | `agent-factory request add <file> [--images <dir>] [--requester <name>]` | stores a product request |
| | `agent-factory request challenge <id>` | challenges a request and drafts its specs; queued for the running factory |
| | `agent-factory issue create <spec.md> [--blocked-by <n>[,<n>]] [--confirm] [--start]` | creates an issue from a spec file; `--start` validates it |
| | `agent-factory issue validate <issue>` | validates the spec of a drafted issue, so the factory takes it |
| | `agent-factory issue abandon <issue> --reason <text>` | frees the worktree of an escalated issue; refused while the factory runs |
| | `agent-factory resume <issue> [--answer <text> \| --review-again]` | returns an escalated issue to the stage it left, with the answer to its question; `--review-again` has the same implementation reviewed once more after a review escalation whose gate passed |
| | `agent-factory merge <pull-request> --expected-head <sha>` | squash-merges the reviewed head |
| | `agent-factory pr feedback <pull-request> <file> --author <name>` | records review feedback and starts a new cycle |
| | `agent-factory audit <commit> [<commit>...]` | audits commits of the base branch; queued for the running factory |
| | `agent-factory film <issue> --scenario <name>` | orders a film of the open pull request of an issue (`declare-films`) |
| Set up | `agent-factory init [<repository>]`, `agent-factory schema`, `agent-factory rehearsal init <source-clone>`, `agent-factory rehearsal reset <source-clone>`, `agent-factory rehearsal add-issue <spec.md>` | the configuration and the rehearsal on a local forge; the operator's |

A gesture the operator delegated (`issue create --start`, `issue validate`, `resume`, `resume --answer`, `merge`) takes `--as orchestrator --reason "<why>"` after its other options when you take it on your own judgement; both options go together. The factory checks the project's autonomy policy before it does anything else and refuses what the policy does not delegate, naming the missing rule (exit 1). It records each gesture it accepts with your reason, and tells the operator. A gesture the operator orders is made without `--as`. `resume --review-again` is the operator's alone: with `--as` it is refused whatever the policy allows. So is `pr feedback`: no policy delegates it, so prepare the feedback file and give the operator the command (`merge-and-release`).

Exit codes: 0 done, 1 failed or refused, 2 wrong command line, 3 the issue needs a person, 4 the issue waits on others, 5 the command needs `--confirm`.

## The cockpit

The cockpit address is the one `agent-factory status` prints on its `Factory:` line (`http://127.0.0.1:7430` unless the configuration says otherwise). Its API answers reads without a token:

- `curl -s <cockpit>/api/state` is the whole snapshot. Select with `jq`: `.projects[]` has `issues[]`, `pullRequests[]`, `pauses[]`, `issueTypes[]`, `releases[]`; `.runs[]` has every agent run.
- `curl -s <cockpit>/api/runs/<run-id>/log` is the log of one run.

Everything else the cockpit does (cutting a release, abandoning an issue while the factory runs, rewriting a frozen check) is the operator's.
