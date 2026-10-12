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
(the `spec:validated` label) is the operator's gesture that hands it to the factory.
`issue create --start` creates and validates in one go.

A spec has a title and four sections: **Need**, **Acceptance criteria** (numbered),
**Out of scope** and **Expected proof**. The issue's `type:` label chooses its proof
rule and its commit type.

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

## Merging and feedback

A pull request is merged on your order only: **Merge** (or `agent-factory merge <pr>
--expected-head <sha>`) removes the evidence folder and squash-merges the head you
reviewed. A check that also fails on the base branch is shown but does not block.
Review feedback from people goes back to the factory with **Send feedback** (or
`agent-factory pr feedback <pr> <file> --author <name>`), which starts a new cycle.

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
  pause.

## Following from elsewhere

With `server.remoteAccess.kind: tailscale`, publish the cockpit on your tailnet with
`tailscale serve` and open it from any of your devices; each request carries your
Tailscale login, and `allowedLogins` restricts who gets in.
