# ADR 0002: License

Status: accepted
Date: 2026-10-12

## Context

The repository is built to be published. Its users run it on their own machines
against their own repositories, embed its role prompts in their agent runs, and may
adapt it to their organisation. Contributors need to know under which terms their
work is shared.

## Options

1. **Apache-2.0.** Permissive, with an explicit patent grant and a clear
   contribution clause; widely accepted by companies.
2. **MIT.** Permissive and short, without a patent grant.
3. **A copyleft license (GPL-3.0, AGPL-3.0).** Forces derivative works to stay
   open; deters adoption inside companies, which is where a factory like this runs.

## Decision

Apache-2.0, with the unmodified license text in `LICENSE`. Contributions are
accepted under the same license (stated in `CONTRIBUTING.md`).

## Consequences

- The license is declared in `package.json`, in the plugin manifest and in the
  README.
- Third-party licenses of the shipped dependencies are listed in
  `THIRD_PARTY_NOTICES.md`, generated from the lockfile.
