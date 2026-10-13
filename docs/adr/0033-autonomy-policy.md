# ADR 0033: The orchestrator acts within an autonomy policy the factory enforces

Status: accepted
Date: 2026-10-12

## Context

The operator's gestures are what the cycle waits on:
- validating a spec;
- answering an agent's decision;
- resuming an issue that needed a person;
- merging a pull request.

An orchestrator agent can make some of them on the operator's behalf, for example
merging a documentation change or a fix whose film shows the defect gone. Other changes
need a person's judgement, such as a visual change or a product choice. Which gestures
are delegated, on which kinds of work, is the operator's decision. The operator must be
able to see afterwards every decision taken without them.

## Options

1. **Rely on the orchestrator's instructions.** Nothing stops a gesture the instructions
   forgot to forbid, and nothing records why it was made.
2. **A policy per project, enforced by the factory.** Each gesture names who makes it
   and why, and the factory refuses what the policy does not delegate and records what
   it accepts.
3. **Separate forge credentials for the orchestrator.** The forge would tell people
   apart, but not kinds of work. The factory writes to the forge with the operator's
   login anyway.

## Decision

Option 2.

- **Declaration.** `projects[].autonomy` names the delegate (`actor`, `orchestrator` by
  default) and what it may do:
  - `validateSpecs`, `answerDecisions` and `resume`, each true or false;
  - `merge`, a list of rules `{ types, requires }`. `types` lists the issue types it
    may merge. `requires` lists conditions such as `films-recorded`: every film the
    spec declares is recorded and none failed. With no `autonomy`, nothing is delegated.
- **Acting as the delegate.** The command line's gestures take `--as <actor>` and
  `--reason "<why>"`. The factory checks the policy before anything else and refuses a
  gesture it does not delegate, naming the rule that is missing. A gesture without
  `--as` is the operator's own.
- **Record.** Every gesture the delegate makes is an event with its actor and its
  reason. The cockpit lists them per project as the delegate's decisions, and the
  operator's notifications report each one.
- **Not a security boundary.** The delegate runs with the operator's account and could
  run anything the operator can. The policy keeps its gestures within what the operator
  delegated and makes each one visible. It does not confine a hostile process.

## Consequences

- Delegation is explicit and per project. A new issue type is delegated only once the
  operator adds it to a rule.
- Merges made by the delegate keep every guard of a merge: the head the reviewer saw,
  the checks and the films in progress.
- A delegate never re-rolls the independent review: a new review of the same
  implementation (`resume --review-again`) is the operator's to order, whatever `resume`
  allows, and the factory refuses it to the delegate.
- The operator reads what was decided without them in one place, with the reason each
  gesture gave.
