# Contributing

Bug reports, questions and pull requests are welcome. For anything larger than a
fix, open an issue first so we can agree on the shape of it. Read
[the architecture](docs/ARCHITECTURE.md) before changing code.

## Prerequisites

- Node.js 24.11 or later and pnpm 10 (the versions in `.node-version` and
  `package.json`).
- `git`, `bash`, and [gitleaks](https://github.com/gitleaks/gitleaks) for the secret
  scan of the git hooks.
- For the end-to-end and screenshot scripts: the Playwright Chromium build
  (`pnpm exec playwright install chromium`).
- On Linux, [bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`) for the
  sandbox integration tests.

Nothing else: the tests use a fake `claude` and a local forge, so no model, no
credential and no network are needed.

## Front door

Every verb is a shebang script in `script/`, also reachable as `pnpm run <verb>`.
`mise run <verb>` runs the same scripts.

| Script | Does |
|---|---|
| `script/setup` | install the dependencies from the lockfile, build the cockpit, and activate the git hooks |
| `script/lint` | ESLint, type-check every package, the schema and notices freshness, `claude plugin validate` of the plugin and its marketplace (skipped when `claude` is not installed), shellcheck, actionlint |
| `script/test` | unit, property, contract and integration tests of every package |
| `script/e2e` | both end-to-end suites below |
| `script/e2e-example` | the fictional example project from spec to merge through the command line, with the fake `claude` |
| `script/e2e-cockpit` | every cockpit command clicked in a real browser against a running factory, in demo and rehearsal modes |
| `script/scan` | denylist scan of the working tree and the whole history, then gitleaks |
| `script/screenshots` | regenerate the README screenshots from the demonstration (`--check` verifies they are current) |
| `script/schema` | regenerate `schema/config.schema.json` from the configuration's schema (`--check` verifies it) |
| `script/third-party-notices` | regenerate `THIRD_PARTY_NOTICES.md` from the production dependencies (`--check` verifies it) |
| `script/lockfile` | rewrite `pnpm-lock.yaml` without installing anything |
| `script/ci` | everything CI runs, in the same order |
| `script/factory` | the product's command line (`script/factory help`) |
| `script/start` | start the factory and its cockpit (`--demo` for the demonstration mode) |
| `script/release` | write the changelog section, set the version, commit and tag a release from `main` |

Run `script/ci` before you push. The `pre-push` hook runs the scans on what a push
carries and refuses the push on a finding.

## Machine safety

The scripts that start heavy work (installs, test suites, builds, browsers) refuse
to start when less than 40 % of memory is free or when memory pressure is not
normal, and run under `nice -n 10`. Tests run with at most two workers
(`AGENT_FACTORY_TEST_MAX_WORKERS`). Do not start two heavy jobs at once.

## Code

- Dependencies point inward: `domain` imports nothing from other packages,
  `application` imports only `domain`, adapters implement ports declared in
  `application`. See [ADR 0005](docs/adr/0005-layered-architecture.md).
- TypeScript strict, run directly by Node (type stripping): no enums, no
  namespaces, no parameter properties, `.ts` extensions in relative imports. No
  `any`, no `as` casts outside the parsing boundary of an adapter; external data is
  parsed with a zod schema.
- Every literal with meaning is a named constant declared next to its domain
  concept.
- The plugin (`packages/plugin`) carries the orchestrator agent and its skills beside
  the run hooks and role prompts. A skill states rules and commands for the agent that
  reads it and quotes only verbs the command line defines; a test of the server
  package checks both, and `script/lint` validates the manifests.
- State changes go through the domain transition tables and are appended to the
  event log.
- Agent runs never receive credentials; outward writes live in orchestrator code
  only.
- Cover every layer a change touches: unit tests for domain rules, property tests
  where the input space is wide, contract tests at the boundaries (the `claude`
  stream, forge payloads, the cockpit API), integration tests for adapters against
  real `git` and real sandboxes, end-to-end tests for the operator's journeys. Tests
  sit next to the code (`*.test.ts`).
- Identifiers, comments, test names, log messages and error strings are in
  English. The cockpit's user-facing text lives in its locale files (English and
  French).

## Documentation

User documentation lives in `README.md` and `docs/`; decisions in `docs/adr/`.
Write for the reader of the page: state rules and facts that hold, not the history
of how they came to be. Rationale belongs in an ADR, the commit message or the pull
request.

## Commits

- Conventional Commits: `type(scope): subject`, with the package as the scope
  (`feat(cockpit): …`, `fix(adapters): …`).
- Keep a change small and separately reviewable; one concern per commit.
- Stage files by path (`git add path/to/file`), not `git add -A`.
- Do not add AI attribution to commits or pull requests: no `Co-Authored-By`
  trailer for a tool and no "generated with" line. The `commit-msg` hook removes
  them.

Contributions are licensed under Apache-2.0, like the rest of the repository.
