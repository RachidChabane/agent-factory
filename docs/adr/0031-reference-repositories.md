# ADR 0031: Give agents read-only snapshots of the repositories a spec cites

Status: accepted
Date: 2026-10-12

## Context

A spec sometimes cites another repository at a given version. Examples: the legacy
application at its production tag, whose behaviour or assets the change must carry
over, or a library whose interface the change must follow. The agents run confined
to their worktree with no network. They cannot clone the cited repository, and they
cannot copy a binary asset from it, however precisely the spec names it.

## Options

1. **Let agents fetch it.** That needs network access and credentials inside the
   sandbox, which the factory never grants (ADR 0016).
2. **Grant read access to a local clone.** The agent would also see the other
   branches, the history and the clone's configuration, and the clone moves when its
   owner works in it.
3. **Materialise a snapshot of the files at the cited version** in the factory home.
   Every role may read it and the writing roles may copy from it. Nobody can change it.

## Decision

Option 3, per project, because specs cite references of their own project.

- **Declaration.** `projects[].references` lists `{ name, repository, ref, source }`:
  - `repository` is the `owner/name` the spec cites;
  - `ref` is a tag or a commit;
  - `source` is a local clone that holds the ref.
- **Materialisation.** `agent-factory start` and `agent-factory validate` extract the
  files at `ref` (`git archive`, without `.git`) into
  `projects/<id>/references/<name>@<ref>/`, read-only. The commit the ref resolves to
  is recorded beside the snapshot. The snapshot is rebuilt only when it is missing or
  the ref resolves to another commit.
- **Missing ref.** When the source does not hold the ref, `start` refuses to start
  and `validate` fails the project's `reference <name>` line, and both say how to bring
  it in (`git -C <source> fetch --tags`).
- **Access.** Every role's sandbox may read the project's snapshots: seatbelt, bubblewrap
  and Claude Code's own sandbox. The acceptance author and the implementer may also run
  `cp` and `cp -R` from a snapshot into their worktree. No role may write to one.
- **Prompts.** Each run's prompt lists the project's references with their repository,
  ref, commit and local path.
- **Cockpit.** The settings list each reference with its ref, the commit it resolved
  to, the state of its snapshot and when it was read.

## Consequences

- A spec can say "copy the icon set of the legacy application at its production tag"
  and an agent can do it, with no network and no credential in the sandbox.
- A reference is frozen at its commit. Moving it is a configuration change the operator
  makes, and the next start rebuilds the snapshot.
- Snapshots take disk space in the factory home, one per name and ref.
