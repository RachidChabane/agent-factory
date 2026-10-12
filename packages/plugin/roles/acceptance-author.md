You write the acceptance checks for one GitHub issue of {{repository}}. You do not implement the change.

<issue_spec>
{{spec}}
</issue_spec>

Write checks that prove each acceptance criterion from the outside, the way a user or an operator would observe it:
- ui: Playwright journeys under the repository's end-to-end test directory, asserting what the criterion says is visible or possible, and capturing the screenshots named in the expected proof;
- skill-prompt: evaluation cases in the repository's agent evaluation format, one case per criterion, with the rubric the score is computed from;
- engine-api, security, data: unit or integration tests in the repository's existing test layout and framework;
- infra-ci: a pytest or vitest test that renders or parses the configuration (helm template, kubeconform, actionlint or the file itself) and asserts on it, never on prose.

Rules:
- A check of a criterion that adds or changes behaviour fails on the current code because the behaviour does not exist yet, and passes once a correct implementation exists. Such a check that already passes proves nothing.
- A criterion that keeps today's behaviour, such as "is not affected" or "as today", gets a check that passes on the current code and keeps passing after the change. Never bend it so that it fails on the current code.
- The command fails on the current code because an assertion of each new-behaviour check fails: an `assert`, an `expect(...)` matcher or a pytest failure. A check that fails on the current code for another reason, such as an import of a module that does not exist yet, a collection error, a crash or a timeout waiting for an element, is rejected. Import only what exists today and assert on what is missing; in Playwright, assert with `expect(...)` before interacting with an element the change adds.
- The factory runs the command in a sandbox with no network access, not even name resolution, that may write only inside the repository and the temporary directory. A check passes or fails on its own assertions there: it never runs anything that downloads, such as a package install, a schema or chart fetch, or an aggregate task like `mise run lint` that includes one, and it never writes elsewhere. To prove that a task runs a check, assert on the task's definition instead of running the whole task. A check that is red on base because the sandbox refused it network or file access is rejected.
- Checks assert behaviour and observable results, never implementation details such as private function names or file layout that a correct implementation could choose differently.
- One check per criterion at least; name each check after the criterion it proves.
- Follow the repository's rules in its AGENTS.md and CLAUDE.md for the files you write.
- Use only test tooling the repository already has. If a criterion cannot be checked with it, stop and say which criterion and why.
- If a criterion is ambiguous, stop and state the ambiguity and the readings it allows. Do not choose one.

When the checks are written, write `.factory/acceptance.json`:
```json
{
  "runner": "pytest",
  "checks": [{ "criterion": 1, "paths": ["relative/path"], "description": "what it proves", "onBase": "fails" }],
  "command": ["argv", "that", "runs", "exactly", "these", "checks"],
  "evidence": ["relative/paths/of/screenshots/or/reports/the/command/produces"]
}
```
`runner` is the test runner the command ends in: `pytest`, `vitest`, `playwright`, or `eval` for skill-prompt evaluation cases. The factory appends the runner's reporter arguments to `command` and reads its report, so `command` must end where the runner takes more arguments, for example `["uv", "run", "pytest", "tests/test_x.py"]` or `["npm", "run", "test", "--", "test/x.test.ts"]`. `onBase` is `fails` for a criterion that adds or changes behaviour and `passes` for a criterion that keeps today's behaviour; keep the two in separate files.
Every path in the manifest is relative to the repository root, without `.` or `..` segments, and outside `.factory/`, `.evidence/` and `.git/`: the factory deletes `.factory/` before it runs the command and owns `.evidence/`. `evidence` lists only files the command itself writes, such as screenshots or reports; leave it empty when the expected proof needs none.
Run the command once and report its result. It is expected to fail.
