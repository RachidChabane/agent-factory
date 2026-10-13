---
name: watch-factory
description: Run agent-factory watch and react to each line it prints. Use at the start of a session, and whenever a watch has ended.
---

# Watch the factory

`agent-factory watch` polls the running factory every 20 seconds and prints one line for each blocker that appears or clears since the last watch reported. Nothing is printed while nothing changes.

## Run it

Start it with the Monitor tool: command `agent-factory watch --all` at the start of a session, `timeout_ms` 1800000, description `factory blockers`. Each line then reaches you as it is printed. A monitor lives 30 minutes at most: start it again when it expires, as `agent-factory watch`. Where there is no Monitor tool, run the command with Bash in the background and read its output file.

A watch keeps what it reported in the factory's state directory, so a restarted watch prints only what appeared or cleared since the last one reported. `--all` makes its first reading list every blocker present, whatever was reported before; so does a state directory that holds nothing yet. `agent-factory watch --once --all` lists every blocker present now and records nothing: use it before a report. Match each line to what you know by its kind and its place before acting.

`agent-factory watch --once` prints what a watch would, records nothing, and exits 1 while anything blocks work, 0 when nothing does. `--json` prints one JSON object per line (`at`, `transition`, `kind`, `project`, `issue`, `key`, `detail`). `--port <port>` names a factory started on another port, and `--interval <seconds>` sets the pace.

## A line

```
2026-10-12T14:03:20Z blocked needs-human storefront#12: the before proof is not valid
2026-10-12T14:09:41Z cleared needs-human storefront#12
```

The time is the reading time, in UTC. The place is `<project>#<issue>`, `<project>`, or `factory`. A `cleared` line names the blocker without its reason.

## Reaction

| Kind | Means | Do |
|---|---|---|
| `needs-human` | the issue stopped and only a person can go on; the reason follows | `triage-escalation` |
| `decision-pending` | an agent asked a question and waits; the question and the run follow | `triage-escalation`: the answer is `resume <issue> --answer` |
| `run-failed` | the latest run of the work failed in the last hour and the issue is still in the pipeline | wait for `cleared`, the factory retries after a delay; if the issue fails again or escalates, `triage-escalation` |
| `stalled` | an issue in a stage that owes an agent run (authoring, rewriting a check, implementing, reviewing) has had no run and no activity for 10 minutes; an issue whose pull request has a film queued or recording waits for it and is not reported | `triage-escalation` |
| `paused` | the operator, the budget or the machine's resources paused the factory or a project for over 10 minutes | read the reason; a budget pause lifts at its reset time, a resources pause when memory is free again, an operator pause is theirs: report it |
| `no-free-worktree` | validated issues wait because every worktree is held; the holders follow | `merge-and-release`: merging a pull request frees its worktree |
| `film-failed` | the latest recording of a film of an open pull request failed; the scenario, the pull request and the reason follow | `declare-films`: fix the cause the reason names, then order the film again |
| `cockpit-unreachable` | the factory does not answer | expected while you run `upgrade-factory`; otherwise run `agent-factory status` and tell the operator |

While the cockpit is unreachable the blockers known stay as they were, and the watch clears or confirms them at the first answer.
