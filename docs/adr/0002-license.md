# ADR 0002: License

Status: accepted
Date: 2026-11-24

## Context

The repository is published. Its users run it on their own machines against their
own repositories, embed its role prompts in their agent runs, and may adapt it to
their organisation. Contributors need to know under which terms their work is
shared.

The author wants anyone to use, study, fork and change the factory, and wants no
one to take the code, close it and present it as their own product.

## Options

1. **Apache-2.0.** Permissive, with an explicit patent grant; widely accepted by
   companies. A fork may be closed and sold as long as the notices are kept.
2. **MIT.** Permissive and short, without a patent grant. Same freedom to close a
   fork.
3. **GPL-3.0.** Copyleft: a distributed fork stays open under the same license. A
   fork offered only as a hosted service distributes nothing, so it may stay
   closed.
4. **AGPL-3.0.** The GPL-3.0 terms, plus the obligation to offer the source to the
   users who reach a modified version over a network. The factory is a server with
   a cockpit, which is how a closed fork would be offered.

## Decision

AGPL-3.0-only, with the unmodified license text in `LICENSE`. Contributions are
accepted under the same license (stated in `CONTRIBUTING.md`).

## Consequences

- Running the factory, unmodified or modified, on one's own repositories carries no
  obligation: the license binds whoever conveys a version or serves a modified one
  to other people.
- A fork that is distributed, or offered to others over a network, publishes its
  source under AGPL-3.0 and keeps the copyright and license notices.
- The code the factory's agents write in a user's repository belongs to that
  repository; it is not a derivative of the factory.
- Some organisations forbid AGPL software; they are the adoption this choice gives
  up.
- The license is declared in `package.json`, in the plugin manifest and in the
  README.
- Third-party licenses of the shipped dependencies are listed in
  `THIRD_PARTY_NOTICES.md`, generated from the lockfile. They are permissive
  (MIT, ISC, OFL-1.1) and compatible with AGPL-3.0.
