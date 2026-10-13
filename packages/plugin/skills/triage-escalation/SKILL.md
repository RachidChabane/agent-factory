---
name: triage-escalation
description: Unblock an issue the factory stopped, or decide that a person must. Use when watch reports needs-human, decision-pending, run-failed or stalled, or when a resume or a gate is refused.
---

# Triage an escalation

## Read

1. `agent-factory status <issue>` (with `--project <id>` when the installation has several projects). `State` and `Needs human` give the stage and the reason; `Implementer attempts`, `Last gate` and `Last review` show what was tried.
2. A decision or a failed run has a run id in its watch line. The question: `curl -s <cockpit>/api/state | jq -r '.runs[] | select(.id == "<run-id>") | .pendingQuestion.text'`. The end of a run's log: `curl -s <cockpit>/api/runs/<run-id>/log | jq -r '.lines[-40:][] | .event | select(.kind == "assistant-text" or .kind == "tool-result" or .kind == "permission-denied") | "\(.kind): \(.text // .content // .message | tostring | .[0:300])"'`.
3. Read the spec and the files the reason points at before deciding.

## Decide

| Cause | Do |
|---|---|
| A question that the spec, the repository or the operator's earlier instructions answer | `agent-factory resume <issue> --answer "<answer>" --as orchestrator --reason "<why>"`. Write the answer as the rule the agent follows. |
| A question that is a product choice, a trade-off or a constraint you cannot derive | Ask the operator with the options and your recommendation, then resume with their answer, without `--as`: the answer is theirs. |
| The reason names a missing tool or an expired login | `agent-factory validate` names the failing check. `agent-factory tool check <name>` and `agent-factory tool login <name>` act on a tool. Then `agent-factory resume <issue> --as orchestrator --reason "<why>"`. |
| The before proof is not valid, or the criteria cannot be checked | The spec is wrong. Write the corrected spec as a new issue (`write-spec`) and propose to the operator to abandon the old one. |
| The gate failed after the retries, or a blocking review finding stands | `resume` is refused once the retry budget is spent or a frozen check was touched. Give the operator the attempts, the failing step and your diagnosis, with a smaller or clearer spec to replace the issue. When the review blocked an implementation whose gate passed and you judge the finding wrong, say so, and leave it to the operator: ordering `agent-factory resume <issue> --review-again`, which reviews the same implementation again without a new attempt, is theirs alone, and `--as` is refused for it. |
| A transient cause (machine memory, a network error, a run that timed out once) | `agent-factory resume <issue> --as orchestrator --reason "<why>"`. |
| `run-failed` | The factory retries after a delay. Wait for the `cleared` line. When the same issue fails again or escalates, read its log and decide as above. |
| `stalled` | `agent-factory status` shows a pause or a stopped factory: follow `watch-factory`. With the factory running and nothing paused, wait one retry delay (5 minutes), then tell the operator. |

`agent-factory resume` is for an issue in `needs-human` only. It requires `--answer` exactly when the issue waits on a decision, and refuses it otherwise.

## Configuration

A cause in `config.yaml` that grants nothing new (a gate command, a timeout, a role's model) you may edit: change the one key, run `agent-factory validate --offline`, and list the change in the report. The factory applies what it can at its next tick. Anything that widens what agents or commands may reach (a command or a network the sandbox refuses, allowed domains, the container engine, budgets, accounts, credentials) is the operator's: write the edit and ask.

## Wake the operator

Ask the operator, rather than act, when:

- the choice is theirs: product, scope, money, access;
- the project's policy refused your gesture;
- the same issue escalated twice for the same cause;
- the cause is outside the repository and the configuration: an account, a credential, the budget, the machine.

Ask in the session with the question tool when they are present. Otherwise put it under `Waiting for you` in the next `morning-report`. Abandoning an issue is theirs: `agent-factory issue abandon <issue> --reason "<why>"` needs the factory stopped, and the cockpit abandons one while the factory runs.

Keep a note of every gesture you made with its reason: `morning-report` lists them.
