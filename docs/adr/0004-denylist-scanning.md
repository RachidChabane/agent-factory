# ADR 0004: Denylist scanning with hashed terms

Status: accepted
Date: 2026-10-12

## Context

Secret scanners such as gitleaks find credentials, but not confidential words: the
names of people, organisations, internal hosts, ticket prefixes or local paths that
must never appear in a public repository. A scan for those words needs the list of
words, and a list committed in plain text would itself publish them.

## Options

1. **Commit the list in plain text.** Simple, and it publishes the very terms it
   protects.
2. **Keep the list in a CI secret and a local file.** Nothing is published, but the
   scan cannot run on a fork, in a contributor's clone, or when CI is unavailable,
   and it depends on repository settings outside the code.
3. **Commit salted hashes of the terms.** Anyone can run the scan; nobody can read
   the terms by looking at the repository or searching it. Short terms remain
   recoverable by brute force, which only tells a determined reader which words are
   guarded, not any confidential content.

## Decision

Option 3, implemented in `tools/denylist`:

- `patterns.json` holds, per term, its category, its length, a rolling hash for fast
  candidate detection and a salted SHA-256 for confirmation. The plain list stays
  outside the repository; `encode.ts` turns it into `patterns.json`.
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
hooks and in CI.

## Consequences

- A term is added by editing the private plain list and running `encode.ts`; the
  salt is kept so earlier hashes stay valid.
- Words that contain a guarded term cannot be used anywhere in the repository,
  including in dependency names and identifiers.
- Binary files (images) are not scanned as text. Screenshots are produced only from
  the demonstration mode, whose data is fictional and whose paths are temporary
  directories.
