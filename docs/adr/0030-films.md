# ADR 0030: Film the behaviour of a pull request with a command the project declares

Status: accepted
Date: 2026-10-12

## Context

Some behaviour can only be judged by watching it: a conversation with an assistant, a
journey across several screens, a flow that signs a real user in. Acceptance checks
cannot show it. They run confined, with no network, against a stack the factory
starts from the code under test (ADR 0018). Reviewers want to see the behaviour before
and after the change, recorded against the running product.

The tool that records such a scenario belongs to the product. It knows how to sign a
user in, which accounts to use, how to drive the product, and what a scenario decides
along the way. The factory knows when a pull request is ready to be filmed, how to
keep the machine and the subscription safe, and how to publish evidence on a branch.

## Options

1. **Record videos from the acceptance checks.** The checks' browser can record, but
   it runs in the sandbox, without the accounts, the network or the services a real
   scenario needs, and a check that films is a check that can fail for reasons the
   change did not cause.
2. **Leave films to the product's own pipeline.** Nothing ties a film to the head the
   operator merges, the pull request body does not announce it, and the merge does not
   wait for it.
3. **The factory orders, queues and publishes films; the project declares the command
   that records one.** The command's inputs and outputs form a contract the factory
   owns. Everything product-specific stays behind the command.

## Decision

Option 3. A film is evidence added to an open pull request, not a stage: the pull
request never waits for a film, and no issue state is added.

- **Declaration.** `projects[].evidence.films` declares `command`, an argument
  template, and its `workingDirectory`, `environment`, `timeoutMinutes`, `replayFile`
  and `timeZone`. A spec names the scenarios its pull request must show in a
  `Films: <scenario>[, <scenario>…]` header. They are stored as `film:<scenario>`
  labels and read back with the spec. A scenario name is letters, digits, dots,
  dashes and underscores, short enough to fit a label.
- **Orders.** Once the pull request is open, the factory orders every scenario the
  spec declares. The operator orders any other scenario with `agent-factory film
  <issue> --scenario <name>` or from the pull request page. A scenario already queued
  or running is not queued twice.
- **Queue.** Films run one at a time across the installation, in the order they were
  ordered. A film starts only when no issue, challenge or audit runs in any project,
  and while one runs it holds every slot. It also needs no agent run open, normal
  memory pressure and free memory above the threshold, checked again before each
  recording. An operator pause holds films. A subscription budget pause does not,
  because the film command does not spend the factory's Claude accounts.
- **Tools.** A project may list the tools its film command needs (`evidence.films.tools`, names declared in
  `tools`). Before a film starts, the factory runs their checks. While one fails, the films of the project stay
  queued, hold no slot and do not fail; the operator is told once, with the tool and its login command, and the
  failing tool is checked again every five minutes. The films start by themselves, with a notice, once every
  tool passes.
- **Recording.** The command runs twice in its working directory. The first run
  records the issue's base commit and the second the pull request head. The
  placeholders are `{ref}` (the commit), `{output}` (an empty directory),
  `{scenario}`, and `{replay}`. `{replay}` is the path of the `replayFile` the first
  run wrote. In the first run, the token holding it is dropped, with the option just
  before it. That way the second run can replay the choices the first one made.
- **Output contract.** Each run writes into `{output}`:
  - `report.json`, with `status` (`recorded` or `skipped`), an optional `reason`, a
    list of `facts` (`label` and `value`) and the `keyFrames` to keep.
  - At least one video (`.mp4`, `.webm`, `.mov` or `.mkv`); the largest is the film.
  - Any screenshots. The last one in path order is the phase's final screenshot,
    plus up to six key frames.

  A missing report, a `skipped` status or a run without a video fails the film with
  the reason.
- **Publication.** A video that is not an MP4 is transcoded to H.264 with `ffmpeg`
  under `nice`. The films, screenshots and both reports go to
  `.evidence/<issue>/films/<scenario>/` on the branch, in one evidence commit. The
  reports and the new pull request body pass the outbound secret scan first. A
  finding, or a failure to copy or commit, fails the film and leaves nothing behind.
  The new head is recorded, and the merge's head check holds on it.
- **Pull request body.** A `## Behaviour on video` section is rendered from the journal,
  one block per scenario:
  - while the film waits, a placeholder with its expected arrival, in `timeZone`, its
    place in the queue and a link to the cockpit;
  - once recorded, a Before and an After with the video links (through the forge's
    file links at the film commit), the screenshots and the facts;
  - on failure, the reason and how to order the film again.

  The expected arrival counts the running film's remainder plus one typical film for
  each film ahead and for this one. A typical film is the median of the last five
  successful films, or `timeoutMinutes` while there are none.
- **Merge.** The merge is refused while a film of the pull request is queued or running,
  with the expected arrival. A failed film does not hold the merge. New feedback and a
  rewritten check drop the recorded films and their orders. The declared scenarios are
  ordered again for the new head.
- **Confinement.** The film command is the one command the factory runs outside the
  sandbox, with the operator's environment plus `environment`. The product's tool
  needs the operator's container engine, secrets, cloud and browser sessions. It runs
  in the factory itself, never in an agent run or a gate, in a process group killed on
  timeout and on stop. `validate` says so on the project's `films` line.
- **Restart.** A film the factory was recording when it stopped is failed at the next
  start, and the placeholders of the queued films are rendered again.

## Consequences

- Any product can film its pull requests by putting one command in front of its own
  scenario tool. A tool whose report has another shape is wrapped by a script that
  writes `report.json` in the contract's shape.
- The pull request opens at once and shows what is coming and when. The operator
  merges the head that holds the films.
- The product's tool runs with the operator's sessions, outside the sandbox. A project
  should only declare a command it trusts like its own scripts.
- Sessions expire while the factory runs unattended. A project that lists the tools of its
  sessions finds one wait, with the login to run, where it would find a failed film for each
  scenario queued during the outage.
- The demonstration records its films with a fake film command, from two tiny sample
  videos kept in the repository (`packages/server/src/demo/films/`, a few kilobytes
  each, regenerated by `script/demo-films`). They are the only videos the repository
  holds.
