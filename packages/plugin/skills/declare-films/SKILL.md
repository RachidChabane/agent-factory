---
name: declare-films
description: Declare the films a pull request must show, and order another film. Use when a spec's behaviour can only be judged by watching the running product, or when a reviewer asks for a scenario to be recorded.
---

# Declare films

A film shows behaviour that acceptance checks cannot: a conversation, a journey across screens, a flow that signs a real user in. The project declares the command that records one; a spec names the scenarios its pull request must show. Declare films only for a project that configures them (`evidence.films`).

## Declare

Add `Films: <scenario>[, <scenario>…]` right after `Labels:` in the spec file (`write-spec`).

- A scenario name is letters, digits, dot, underscore and hyphen, starts with a letter or a digit, and has at most 45 characters.
- One scenario per behaviour a reviewer must see. Name what it shows (`checkout-flow`), not the issue.
- A criterion never asks for what only a film shows, and no check tries to produce one.
- Say in Expected proof what each film is expected to show.

## What the factory does

- Once the pull request is open, the factory orders every declared scenario. The pull request opens at once and never waits for a film.
- The film command runs twice in its working directory: first on the issue's base commit, then on the pull request head. Each run writes a video, screenshots and a report with facts; the pull request shows a Before and an After.
- Films run one at a time across the installation, when no agent run is open and the machine has memory to spare. An operator pause holds them; a subscription budget pause does not.
- The merge is refused while a film of the pull request is queued or running, with its expected arrival. A failed film, with its reason, does not hold the merge.
- New feedback or a rewritten check drops the recorded films and orders the declared scenarios again for the new head. Merge only the head that holds the films.

## Order another film

`agent-factory film <issue> --scenario <name>` orders a scenario once the pull request is open. A scenario already queued or running is not queued twice. After a failed film, read its reason on the pull request, fix the cause, and order it again.
