# ADR 0009: The development cycle of an issue

Status: accepted
Date: 2026-10-12

## Context

The factory exists so that its operator can accept agent work by looking at proof
rather than by reading code. The cycle each issue goes through decides what that
proof is worth. No study compares complete agentic development cycles end to end on
current models; the evidence covers components of a cycle, so the cycle is composed
from those components and measured on real issues.

## Options

1. **Plan, then implement, then review**, with a human validating each plan.
2. **Several agents in parallel** (best-of-N, debate, specialised sub-teams).
3. **Evidence-based cycle**: a validated specification, acceptance checks written
   and frozen before any implementation, one implementer, a deterministic gate, one
   independent reviewer, proof produced by the factory.

## Decision

Option 3, step by step:

1. **Specification.** The issue states the need, observable acceptance criteria,
   what is out of scope and the expected proof. The operator validates it; nothing
   else waits on a human until the pull request.
2. **Acceptance checks.** A run with the role `acceptance-author` writes checks that
   express the criteria. The factory runs them on the base branch: each check of new
   behaviour must fail there on an assertion, each check of kept behaviour must pass.
   The factory then freezes them by recording the hash of every check file.
3. **Implementation.** One run with the role `implementer`, given the full
   specification and the frozen checks, with no instruction to verify its own work.
4. **Gate.** A Claude Code `Stop` hook runs the deterministic gate before the run
   may end: frozen checks unchanged and passing, lint, type-check, tests and the
   repository's own rules. A failing gate is the run's next instruction.
5. **Review.** A run with the role `reviewer`, in a fresh context, sees the diff,
   the specification and the checks, and reports only gaps that affect correctness
   or the stated requirements.
6. **Evidence.** The factory produces the proof the issue type requires and builds
   the pull request body around it; the forge's CI checks run on the pull request.
7. **Pull request.** Opened with its type, its evidence and the issues it closes.
8. **Merge.** Only on the operator's order, squash-merged after the temporary
   evidence directory is removed from the branch.

Retries: two corrections inside the implementation session, then one fresh session
with a summary of the failures on a stronger model or effort, then the issue waits
for the operator with the diagnosis. A frozen check that contradicts the
specification also waits for the operator, who alone can order it rewritten.

Requests from stakeholders are challenged before they become specifications: a run
with the role `challenger` examines each item on its intent, its idea and its method,
with sources, and proposes specifications and a draft reply for the operator only.

## Evidence behind each choice

- One capable agent per change: past a capability threshold extra agents stop
  helping and amplify errors (Kim et al., *Nature Machine Intelligence*, 2026).
- Checks written separately and frozen: agent-written tests do not by themselves
  raise resolution rates (arXiv 2602.07900); models are more likely to tamper with
  tests on impossible tasks, which immutable checks prevent (model system cards).
- An external completion check, not the agent's word: a stop is a report, not a
  proof (Anthropic, *Prompting Claude Opus 5.5*; *Claude Code best practices*).
- An independent reviewer: self-grading approves too easily; a separate evaluator
  that sees the diff against the criteria catches scope creep and gaps (Anthropic,
  *Harness design for long-running apps*, 2026).
- No mandatory plan: plan when the approach is uncertain or spans many files
  (*Claude Code best practices*).
- Two corrections, then a fresh start: correction loops lose effectiveness quickly;
  restarting clean with a better prompt is the recommended way out (*Claude Code
  best practices*; the Debugging Decay Index, arXiv 2506.18403, proposes the same).
- Few, high-stakes human gates: approval quality erodes with volume (arXiv
  2606.22721).

## Consequences

- The factory records, for every issue, first-pass success, number of retries,
  reviewer findings, human refusals, cost and duration, so the cycle can be
  recalibrated on measurements.
- Changing the cycle (adding a step, removing the reviewer) is a decision recorded
  in a new ADR, not a configuration option.
