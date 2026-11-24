# ADR 0004: Denylist scanning with a hashed list kept out of the repository

Status: accepted
Date: 2026-10-12

## Context

Secret scanners such as gitleaks find credentials, but not confidential words: the
names of people, organisations, internal hosts, ticket prefixes or local paths that
must never appear in a public repository. A scan for those words needs the list of
words, and a list in the repository would itself publish them.

## Options

1. **Commit the list in plain text.** Simple, and it publishes the very terms it
   protects.
2. **Commit salted hashes of the terms.** Anyone can run the scan. A hash of a short
   term, or of a name found in a word list, is reversed by brute force in seconds,
   and for a person, an organisation or a host the guarded word is itself the
   confidential fact.
3. **Keep the hashed list out of the repository**, in a file git ignores and in a CI
   secret. Nothing is published. The scan does not run in a clone without the file,
   nor on a pull request that reads no secret.

## Decision

Option 3, implemented in `tools/denylist`:

- `tools/denylist/patterns.json`, which git ignores, holds per term its category, its
  length, a rolling hash for fast candidate detection and a salted SHA-256 for
  confirmation. The plain list stays outside the repository; `encode.ts` turns it
  into `patterns.json`.
- A run without the file reads the same content from the `AGENT_FACTORY_DENYLIST`
  variable. CI sets it from the `DENYLIST_PATTERNS` secret.
- With neither, the denylist scan says that nothing was scanned and passes, so a
  contributor's hooks and a pull request from a fork still work. A run that sets
  `AGENT_FACTORY_DENYLIST_REQUIRED=1` fails instead: CI does on a push to the
  default branch of the repository itself, which is where a guarded term would be
  published.
- Matching is a case-insensitive substring search: every window of each pattern's
  length is hashed, so a term inside a longer word is found.
- Subresource-integrity values (`sha512-<base64>`) are masked before matching,
  because random base64 contains short words by chance. Nothing else is exempt.
- A finding prints the location, the category and a snippet with the term
  redacted, never the term, so CI logs stay clean.
- The scan covers the working tree and file paths, staged content, commit messages,
  author names and emails, reference names and tag messages, and every blob of the
  history. It runs in the `pre-commit`, `commit-msg` and `pre-push` hooks
  (`.githooks/`, activated by `script/setup`), in `script/scan`, and in CI.

gitleaks runs next to it with its default rules (`.gitleaks.toml`), in the same
hooks and in CI. It needs no list and runs everywhere.

## Consequences

- A term is added by editing the private plain list, running `encode.ts`, and
  updating the `DENYLIST_PATTERNS` secret with the new file; the salt is kept so
  earlier hashes stay valid.
- A change merged from a fork is first scanned for guarded terms by the push to the
  default branch, after the merge. The maintainer's `pre-push` hook scans what the
  maintainer pushes.
- Words that contain a guarded term cannot be used anywhere in the repository,
  including in dependency names and identifiers.
- Binary files (images) are not scanned as text. Screenshots are produced only from
  the demonstration mode, whose data is fictional and whose paths are temporary
  directories.
