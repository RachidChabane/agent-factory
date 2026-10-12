# ADR 0015: Audit changes made outside the factory, record those of other automations

Status: accepted
Date: 2026-10-12

## Context

The factory watches the base branch of each project. A change that reached it
without going through the factory (a direct push, a pull request from a person, a
bot's update) is audited by an independent agent, and an unresolved audit blocks a
release that contains it. Repositories also run other automations of their own,
such as another coding agent that opens pull requests from a dedicated branch
family, or a dependency bot. Their changes are known and governed elsewhere;
auditing each of them costs agent time and floods the operator with audits that
say nothing new.

## Options

1. **Audit everything that is not a factory merge.** Safe, noisy, and expensive.
2. **Skip by author or branch silently.** Cheap, but nobody can tell later whether a
   change was skipped on purpose or missed.
3. **Name the other automations in the configuration and record their changes as
   skipped**, visible in the cockpit and in release reports.

## Decision

Option 3.

- A change is a factory merge when it came through a pull request from a branch
  starting with the project's `conventions.branchPrefix`, labelled with the
  project's factory label, by an author that is not a bot.
- `audits.ignore` names the other automations: each entry has a `name` and globs
  over the head branch (`branches`) and over the author login (`authors`). When an
  entry gives both, both must match; an entry with neither matches nothing.
- A change of a named automation is recorded as `audit.skipped` with the
  automation's name, the commit, its author and its branch. It is not audited and
  does not block a release; release reports list it as "not audited" with the name.
- The operator can still order an audit of any skipped change, which then follows
  the normal audit path.
- Everything else is audited, with the reason it was detected (direct push, bot
  author, branch outside the factory, missing factory label).

## Consequences

- Teams that run other automations keep the audit trail useful.
- Removing an entry from `audits.ignore` restores the audit of that automation's
  future changes.
- The cockpit shows skipped changes next to audits, so "not audited" is always an
  explicit, attributable state.
