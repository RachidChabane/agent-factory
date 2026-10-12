# ADR 0008: Issue typology and proof strategies as configuration

Status: accepted
Date: 2026-10-12

## Context

Every issue the factory works on has a type, and the type decides three things:
what "before" proof the frozen acceptance checks must give on the base branch, what
kind of check the acceptance-author writes, and which Conventional Commits type and
scope the change carries. Which types exist depends on the project: a web shop has
user-interface work, a library has none; a project with agent prompts needs
evaluation cases, others do not. The proof rules themselves, though, are few and
general.

## Options

1. **A fixed list of types in the code.** Simple, and wrong for most projects.
2. **Free-form types with free-form proof rules.** Every project would invent its
   own semantics, and the gate could not reason about them.
3. **Project-defined types, each bound to one of a small set of proof strategies
   implemented in the domain.**

## Decision

Option 3. A project lists its `issueTypes`; each declares:

- `id` and the `label` that marks it on the forge (default `type:<id>`);
- `proof`, one of the domain's proof strategies:
  - `fails-on-base`: every new-behaviour check fails on the base on an assertion
    (structured runners only); the gate then requires every one to pass;
  - `fails-on-base-when-expressible`: as above when the criterion can be expressed
    as a check, otherwise no "before" proof and the gate relies on the project's
    other steps;
  - `base-score`: evaluation cases are scored on the base; the gate requires the
    configured minimum improvement on targeted cases and no regression elsewhere;
  - `none`: no frozen check; the existing tests and gate steps are the proof;
- `checks`: the guidance the acceptance-author receives for this type (for
  example "a Playwright journey asserting what the criterion says is visible");
- `commit`: the Conventional Commits type, an optional scope, and optional path
  rules (a change touching `infrastructure/**` is a `feat`, otherwise `ci`);
- `evidence`: what the pull request shows for this type (acceptance results,
  before and after screenshots produced by the checks, a score table);
- `review`: optional extra focus for the reviewer (for example `security`);
- `paths`: optional globs that suggest the type of an audited change.

Test runners are adapters behind one port: `pytest` (JUnit XML), `vitest` and
`playwright` (JSON reports), `node-test` (the Node.js test runner's JUnit XML; the
runner reads its reporters before the test files, so they travel in `NODE_OPTIONS`)
and `eval` (scored cases). Each adapter knows how to ask its runner for a report,
how to read it, and how to tell an assertion failure from an error or a file that
did not load. The acceptance-author is told the runners by name, and the check
guidance of the issue type, through placeholders of its role prompt; the
challenger is told the project's type ids the same way.

`agent-factory init` writes a typology that fits the detected stack, starting from
a preset (`feature`, `fix`, `ui`, `api`, `security`, `infra`, `data`, `dependencies`,
`docs`, `refactor`, `release`, `prompt`).

## Consequences

- The before-proof, manifest validation, gate, pull request body and commit message
  read the type definition from the project instead of a table in the code.
- A type that a project does not declare cannot be scheduled; a spec with an unknown
  type is reported at validation with the list of known types.
- New proof strategies are added in the domain with their tests; new runners are
  added as adapters.
