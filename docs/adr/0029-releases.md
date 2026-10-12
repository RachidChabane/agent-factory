# ADR 0029: Releases from a tag, with the changelog written by a script

Status: accepted
Date: 2026-10-12

## Context

The factory is installed from its repository (`git clone`, `pnpm install`), not from a
registry. A release must say what changed, be reproducible from the commits, and
carry no step that depends on a person remembering it.

## Options

1. **release-please**: release pull requests opened by a bot. One more automation on
   the repository, and pull requests the maintainer must merge.
2. **A tag cut by a script**: `script/release <version>` writes the changelog section
   from the Conventional Commits since the previous tag, commits it and tags; a
   workflow turns the pushed tag into a GitHub Release whose notes are that section.

## Decision

Option 2. Versions follow Semantic Versioning, tags are `v<version>`. The changelog
groups the commits since the previous tag by type (features, fixes, then the rest) and
links each to its commit. `.github/workflows/release.yml` runs on a pushed `v*` tag,
checks the tag matches a changelog section, and creates the GitHub Release with it.
Nothing is published to npm or any other registry.

## Consequences

- `CHANGELOG.md` is written only by `script/release`; a hand edit is overwritten by
  the next release.
- A release needs only the repository and `gh`; it reproduces from the commits.
