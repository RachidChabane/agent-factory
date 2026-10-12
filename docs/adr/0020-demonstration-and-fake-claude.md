# ADR 0020: A demonstration on fictional projects, played by a fake Claude

Status: accepted
Date: 2026-10-12

## Context

Someone discovering the factory, a contributor and CI all need the factory running
with real data and no account: no Claude login, no GitHub token, no network. The
README's screenshots must come from the product itself, and nothing about a real
company may appear in them.

## Options

1. **Recorded snapshots** replayed by the cockpit. Shows pixels, proves nothing: no
   button would act on a real factory.
2. **Mocks inside the factory.** The code that runs in production would differ from
   the code that is shown.
3. **The real factory on local forges, with a fake `claude`** that plays a scenario,
   and a story that adds work the way a team would.

## Decision

Option 3. `agent-factory start --demo` prepares a temporary home with two fictional
projects (a shop and a billing API, `example-org`) whose repositories come from
`examples/`, on local forges whose checks run each project's own gate. The factory
runs unchanged; only the `claude` command points at `packages/fake-claude`, which
speaks the CLI's stream-JSON protocol, runs the hooks it is given and plays a scenario
file: per role, the work an agent does when its prompt names an issue of the story.
A story player then does what people do: requests arrive and are challenged, issues
are opened and validated, a pull request is merged once its checks pass, a person
pushes straight to the base, another automation merges a branch, a tag is
published. The temporary home is removed when the demonstration stops.

The stories are content with tests: every scripted check fails on the base by
assertion, every scripted attempt is refused or passed by the real gate as the story
says, and the prose reads as a real team's work.

## Consequences

- Every button of the cockpit acts on a running factory in the demonstration, which is
  what the end-to-end suite and the screenshots use.
- The fake Claude is also the agent of every test and of CI: no test needs a model.
- Work the stories do not script (an issue the visitor writes) reaches the fake's
  built-in behaviour: the acceptance author writes nothing, and the issue goes to a
  person with that reason.
