# Operator guide

The operator decides; the factory works. This guide follows a day with the factory:
starting it, turning requests into work, answering what it asks, merging, releasing,
and keeping it healthy.

## Start and stop

```sh
agent-factory start            # the factory and its cockpit, on http://127.0.0.1:7430
agent-factory status           # the installation at a glance, in a terminal
agent-factory stop             # drain: no new work, exit once running work is done
agent-factory stop --now       # stop now, agents included
```

`agent-factory` is `script/factory` in a clone of the repository (`pnpm run factory`
works too). The factory refuses to start twice on the same home. Before a restart,
prefer the drain: nothing in flight is cut short. The cockpit's **Drain** does the
same.

Before the first start, `agent-factory validate` checks the configuration, every tool
the installation needs (git, gh, claude, the sandbox), each project's clone, labels,
prompts, knowledge, reference snapshots (built when missing), sandbox grants and tools,
and runs each project's setup and gate commands on a clean checkout of its base
(`--skip-gate-preflight` leaves that out).

## The cockpit

| Page | What it is for |
|---|---|
| Board | every project's work by state, from request to delivery, with the runs in progress |
| Requests | product requests, their challenge (intent, idea, method), the specs it proposes, the reply to the requester |
| Issues | each issue's spec, attempts, gate results, review rounds, costs and dependencies, as a list or a graph |
| Pull requests | checks, evidence (before and after), review rounds, the diff, and the merge |
| Delivery | environments with their current deployment, history and health series; redeploy |
| Releases | release candidates, their commits and the reasons their gate blocks |
| Audits | changes that reached the base branch outside the factory, their verdict, and the changes of other automations |
| Runs | every agent run with its live log |
| Usage | each account's subscription limits with their reset times, and costs |
| Settings | roles, budgets, resources, concurrency, tools, notifications, the configuration file; per project, the reference repositories with their ref, resolved commit and snapshot state |

Every value shows when it was read; an unknown value says so. Every button sends one
command and shows the factory's answer, or the reason it refused.

## From a request to an issue

1. A request arrives (`agent-factory request add <file> --requester <name>`, or **New
   request** in the cockpit), with its images.
2. **Challenge** it: an agent examines the intent, the idea and the method, and
   proposes specs and a reply to the requester. Nothing becomes work yet.
3. Review and edit the proposed specs, then **Create issues** (they open as drafts) or
   **Create and start** (validated at once, the factory takes them).

An issue written by a person on the forge, or created with `agent-factory issue create
<spec.md>`, is a draft too: it carries the `factory` label and waits. **Validate spec**
(the `spec:validated` label) is the operator's gesture that hands it to the factory;
`agent-factory issue validate <issue>` makes it from the command line, and
`issue create --start` creates and validates in one go.

A spec has a title and four sections: **Need**, **Acceptance criteria** (numbered),
**Out of scope** and **Expected proof**. The issue's `type:` label chooses its proof
rule and its commit type.

## Writing a spec

A spec file is what `agent-factory issue create <spec.md>` turns into an issue:

```markdown
Title: Show the cart total in the header badge
Labels: type:ui
Films: checkout-flow

## Need
Shoppers cannot tell what their cart costs without opening it.

## Acceptance criteria
1. The header badge shows the sum of the cart's line totals, in the shop's currency.
2. The total updates when a line is added, changed or removed.

## Out of scope
- Discount codes.

## Expected proof
Component tests assert both criteria. The pull request updates the cart page of the user guide.
```

- The first line is `Title:`, the second `Labels:` with one `type:` label of the
  project's issue types. An optional `Films:` line follows, for a project that
  configures films. `spec:validated` is never written in the file: validating is the
  operator's gesture.
- The four sections are `Need`, `Acceptance criteria` (a numbered list), `Out of scope`
  (a bullet list) and `Expected proof`, none empty.
- Every acceptance criterion is checkable by the repository's own test tooling, as the
  issue type describes it, and states an observable result.
- Documentation requirements go in `Need` and in `Expected proof`, never in the
  criteria.
- Behaviour that needs the whole running product goes to a film (`Films: <scenario>[,
  <scenario>]`), not to a criterion.
- One issue per independently mergeable change. An issue that cannot be merged before
  another is created with `--blocked-by`: create the blocking issue first, then
  `agent-factory issue create <spec.md> --blocked-by <number>[,<number>]`. The factory
  starts an issue once every issue it is blocked by is merged.

## While an issue runs

The factory writes the checks, proves they fail on the base, implements, gates,
reviews and opens the pull request with its evidence. You do nothing unless it asks:

- **Needs a person**: the issue stopped, with the reason. Fix what it names, then
  **Resume** (`agent-factory resume <issue>`), or **Abandon** with a reason.
- **A decision**: an agent asked a question only a person can answer (a product
  choice, a constraint of the repository). Answer it from the issue page, or with
  `agent-factory resume <issue> --answer "<text>"`; the agent continues with it.
- **Rewrite a check**: when a frozen check is wrong, order its rewrite from the issue
  page with an instruction; the acceptance author rewrites it and the proof runs again.
- **Pause** an issue, a project or the whole factory, and **Resume** it.

## Watching what blocks

`agent-factory watch` polls the running factory every 20 seconds (`--interval
<seconds>`) and prints one line for each blocker that appears or clears, with the time
of the reading. Nothing is printed while nothing changes.

```
2026-10-12T14:03:20Z blocked needs-human storefront#12: the before proof is not valid
2026-10-12T14:09:41Z cleared needs-human storefront#12
```

| Kind | The blocker |
|---|---|
| `needs-human` | an issue the factory stopped, with the reason it gave |
| `decision-pending` | an agent run that asked a question and waits for the answer |
| `run-failed` | the latest run of an issue still in the pipeline failed in the last hour |
| `stalled` | an issue in a stage that owes an agent run has had no run and no activity for 10 minutes |
| `paused` | the operator, the budget or the machine's resources paused the factory or a project for over 10 minutes |
| `no-free-worktree` | validated issues wait because every worktree of the project's pool is held |
| `film-failed` | the latest recording of a film of an open pull request failed, with the scenario and the reason it gave; it does not hold the merge |
| `cockpit-unreachable` | the factory does not answer, until it does |

The first reading prints every blocker present. `--once` prints the blockers present now
and exits 1 when there are any, 0 when there are none. `--json` prints one JSON object
per line. `--port <port>` names a factory started on another port; the host and port
otherwise come from `server` in the configuration, and a server on port `0` cannot be
watched.

Each running issue, each open pull request and each issue waiting for a person keeps a
worktree (`worktrees.size`, 5 by default). When all are held, validated issues wait: the
board and the project's overview name the issues that wait and the ones that hold the
worktrees, and one notice reaches the declared channels. Merge a pull request or abandon
an issue to make room. `agent-factory validate` states how many pull requests the pool
lets await review beside the running issues, and warns when it leaves no room for one at
the concurrency ceiling.

## Merging and feedback

A pull request is merged on your order only: **Merge** (or `agent-factory merge <pr>
--expected-head <sha>`) removes the evidence folder and squash-merges the head you
reviewed. A check that also fails on the base branch is shown but does not block.
Review feedback from people goes back to the factory with **Send feedback** (or
`agent-factory pr feedback <pr> <file> --author <name>`), which starts a new cycle.

A check that fails on every pull request and on the base branch is the repository's
problem, not the change's: the cockpit marks it as failing on the base and the merge
does not wait for it. Fix it in its own issue. A re-run of a check runs the workflow as
the original run had it, so a workflow fixed afterwards reaches a pull request only with
a new run, which a new commit on its branch gives.

## Behaviour on video

A project that declares `evidence.films` ([configuration](configuration.md#films)) has
its pull requests filmed: the same scenario recorded on the issue's base and on the
head of the pull request, by the project's own tool. A spec asks for scenarios with a
`Films: checkout-flow, order-history` header, and the factory orders them as soon as
the pull request is open. You order any other scenario with **Film** on the pull
request page, or `agent-factory film <issue> --scenario <name>`; a running factory
queues the order, a stopped one records it at once.

- Films wait in one queue for the whole installation and run one at a time. A film
  starts only when no issue, challenge or audit runs in any project, and while it
  records, nothing new starts. A pause of the factory or of the project holds the
  queue; a spent subscription budget does not, because the film command spends none of
  it.
- The pull request body announces each scenario at once, with the time it is expected
  and its place in the queue, and replaces the announcement with the videos and
  screenshots when they land. The cockpit's **Videos** section shows the same, with
  the state of each film.
- **Merge** waits while a film of the pull request is queued or recording, and says
  when it is expected. A film that failed does not hold the merge; its reason stands in
  the body and in the cockpit, and you order it again.
- Each film adds one evidence commit to the branch, so the head to merge is the one the
  cockpit shows after the film.

## Releases and environments

The factory reads what is deployed where, samples health, and computes each release's
gate: no open audit among its commits, complete evidence for each merged pull
request, healthy environments before production. **Cut release** when the gate allows
it. Production is always deployed by a person: the factory links to its workflow.
**Redeploy** re-runs the deployment of a non-production environment at its deployed
version.

## Outside changes

A commit that reaches the base branch without the factory is audited: an agent says
whether to keep it, challenge it or rewrite it, and drafts an issue when it should be
redone. Changes of other automations the project names (`audits.ignore`) are recorded
without an audit. **Resolve** an audit with a note, or **Publish** its draft as an
issue.

## Keeping the factory healthy

- **Subscription usage** is read every few minutes from Claude Code's own report
  (free); no agent run starts once an account passes its pause thresholds, and the
  cockpit says which limit and when it resets. `agent-factory usage --refresh` reads
  it now.
- **Machine resources**: no run starts below the minimum free memory or above the
  allowed memory pressure.
- **Tools**: each connected tool shows its last check; **Check** runs it again, **Log
  in** starts the login the tool declares, and declared keep-alives run on schedule.
- **Configuration**: edit `config.yaml` by hand or from **Settings**; the cockpit says
  what applied, what waits for a restart, and what was refused.
- **Notifications** reach the declared channels when something needs you: a decision,
  an issue that needs a person, a pull request ready to merge, a release gate, a
  pause. A pull request is announced once per head, when its required checks passed and
  none of its films is queued or recording; a film that failed holds the notice, and the
  pull request page says why. With `notifications.media`, the notice lists links to the
  films (before and after), their final screenshots and the evidence images, made
  reachable by the upload command you declare ([ADR 0034](adr/0034-notification-media.md)).

## Working with the orchestrator

The repository is also a Claude Code marketplace. Its plugin adds an orchestrator agent
that drives the factory for you through the `agent-factory` command line, with a skill
for each part of the work: writing specs, declaring films, watching the factory,
triaging escalations, merging, reporting each morning, upgrading the factory.

```sh
claude plugin marketplace add RachidChabane/agent-factory
claude plugin install agent-factory@agent-factory
claude --agent agent-factory:orchestrator
```

In a session, `/plugin marketplace add RachidChabane/agent-factory` and `/plugin install
agent-factory@agent-factory` do the same. Run the agent on the machine that runs the
factory. The plugin declares no hook: the hooks that gate the factory's own runs are
injected per run, and installing the plugin changes no session besides adding the agent
and its skills.

The orchestrator keeps `agent-factory watch` running and reacts to each line. It turns
requests into specs and issues, answers what the repository and your earlier
instructions answer, merges what needs no judgement, and prepares a one-line review of
the rest. It never edits the factory's event log, its worktrees or the forge, changes
`config.yaml` only for a cause that grants nothing new, and takes no step that widens
what agents may reach unless you ask. It reports each morning: what merged, what waits
for you, what is blocked and why, what it decided for you, and the subscription limits
with their reset times.

What it may do alone is yours to declare, per project, in `autonomy` ([ADR
0033](adr/0033-autonomy-policy.md)): validating specs, answering decisions, resuming
issues, and merging the issue types you list under the conditions you name. Without
`autonomy`, nothing is delegated. The orchestrator makes each of these gestures with
`--as orchestrator --reason "<why>"`; the factory refuses what the policy does not
delegate, names the rule that is missing, and records what it accepts with the reason.
The cockpit lists each project's delegated decisions. The orchestrator runs with your
account, so the policy keeps its gestures within what you delegated and makes each
visible; it does not confine a hostile process.

## Following from elsewhere

With `server.remoteAccess.kind: tailscale`, publish the cockpit on your tailnet with
`tailscale serve` and open it from any of your devices; each request carries your
Tailscale login, and `allowedLogins` restricts who gets in.
