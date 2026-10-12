# ADR 0003: A clean history, code ported file by file

Status: accepted
Date: 2026-10-12

## Context

Agent Factory generalises a factory that was first built for a single product
inside an organisation. That earlier code base works and is well tested, but its
history, its fixtures, its example configuration and its knowledge pack carry
names, hosts, identifiers and incident details of that organisation. A published
repository keeps every byte of its history forever: anything committed once can
be recovered from any clone.

## Options

1. **Fork or clone the earlier repository and rewrite its history.** Keeps the
   commit trail, but a history rewrite is easy to get wrong, and every missed blob,
   message or tag leaks.
2. **Start from an empty history and bring the code over file by file**, each file
   passing a deterministic cleaning step (renames, removal of organisation-specific
   defaults) and the denylist scan before its first commit.
3. **Rewrite everything from scratch.** No risk of leaking, but discards a large,
   tested implementation of a development cycle that was chosen on evidence.

## Decision

Option 2. The repository starts with an empty history. Code is copied from a
snapshot of the earlier working tree, never from its history, and is committed only
once it has been cleaned and has passed the denylist scan. Every fixture that held
real data (issue texts, logins, URLs, audit reports) is recreated with fictional
data rather than edited.

## Consequences

- No commit, blob, message, author or tag of this repository has ever contained
  data of the earlier organisation; the denylist scan of the full history proves it
  (see [ADR 0004](0004-denylist-scanning.md)).
- The commit trail of the earlier implementation is not available here; design
  rationale lives in these ADRs instead.
- Corrections made later to the earlier code base are ported the same way: read,
  cleaned, committed as new changes.
