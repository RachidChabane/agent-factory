# @agent-factory/fake-claude

A deterministic stand-in for the Claude Code CLI. It speaks the `stream-json` protocol the factory reads, runs the hooks the factory configures, and plays the behaviour a scenario file describes, so the factory's tests, its demonstration mode and its end-to-end CI need no model, no login and no network.

The package has no runtime dependency: Node 24 built-ins only. Node runs the `.ts` sources directly.

## Wiring

The factory launches `<claude.command...> <its flags>`. Point `claude.command` at the fake and give it the two flags it owns; it receives the flags of the real CLI after them.

```yaml
claude:
  command: [node, /abs/path/to/packages/fake-claude/src/main.ts, --scenario, /abs/path/to/scenario.json, --state, /abs/path/to/state]
```

| Flag | Meaning |
|---|---|
| `--scenario <file>` | The scenario to play. Required. A relative path resolves against the working directory. |
| `--state <directory>` | Where sessions are kept. Required for agent runs, unused by `/usage`. Created on demand. |
| `--model`, `--effort`, `--permission-mode`, `--tools` | Echoed in the `init` line and in the hook payloads. |
| `--settings <file or JSON>` | The settings whose `hooks.PreToolUse` and `hooks.Stop` the fake runs. |
| `--resume <session>` | Continues a session of the state directory (`-r` also works). |

Both `--flag value` and `--flag=value` are accepted. Every other flag, with or without a value, is ignored.

The prompt is read from standard input, or taken from the argument that follows `-p` / `--print` when there is one (`-p /usage`); standard input is then left unread.

| Environment variable | Meaning |
|---|---|
| `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | How many blocks of a Stop hook one run honours. A non-negative integer; anything else means 2. |

| Exit code | Meaning |
|---|---|
| 0 | The run completed, including a run whose last Stop hook still blocked. |
| 1 | `--resume` named a session the state directory does not hold. |
| 2 | The scenario, the settings, a session record or the command line is invalid. One line on standard error names the file and the field. |
| 70 | An unexpected failure of the fake itself. |

## What a run does

1. The scenario is loaded and validated as a whole. An invalid scenario stops the run before anything is printed.
2. If the trimmed prompt is `/usage`, three lines are printed and the process exits 0: an `init` line, an `assistant` line carrying `usage_report`, and a `result` line (`success`, cost 0, 0 turns). No entry is read and no session is opened.
3. Otherwise the fake picks the script to play (see [Choosing what to play](#choosing-what-to-play)), opens a session, and prints an `init` line and one `rate_limit_event` line.
4. It plays the next attempt of the script, runs the `Stop` hooks, and, when one blocks, plays the next attempt in the same session. See [Attempts, sessions and the Stop hook](#attempts-sessions-and-the-stop-hook).
5. It prints the `result` line.

The output is a function of the scenario, the command line, the prompt, the environment, the answers of the hooks and the state directory. Identifiers are derived from the session counter, timings are computed from the work done, and no line carries a timestamp. Only the reset times of the usage limits depend on the clock.

## Scenario format

A scenario is one JSON object. Every field is optional except where marked. Unknown fields are rejected, and every error names the field, for example `entries[1].attempts[0].steps[2].write.path must be relative to the working directory`.

| Field | Type | Meaning |
|---|---|---|
| `signatures` | object | Overrides the text that identifies each role in a prompt. Keys: `acceptance-author`, `implementer`, `reviewer`, `auditor`, `challenger`. Defaults: `You write the acceptance checks`, `You implement one`, `You review one change`, `You audit one change`, `You examine a product request`. Two roles cannot share a signature. |
| `usage` | object | The limits `/usage` reports and the figures of the `rate_limit_event` line. |
| `usage.session` | `{ percent, resetsInHours }` | Default 12 %, 3 h. Feeds the `session` limit and the `five_hour` window. |
| `usage.weeklyAll` | `{ percent, resetsInHours }` | Default 34 %, 80 h. Feeds the `weekly_all` limit and the `seven_day` window. |
| `usage.weeklyScoped` | list of `{ model, percent, resetsInHours? }` | One `weekly_scoped` limit per item. Default: Opus at 8 %, 80 h. An empty list reports none. |
| `entries` | list | Scripted behaviours, tried in order. |
| `fallback` | object | One script per role (`{ "attempts": [...] }`), used when no entry of that role matches. |

`percent` is between 0 and 100; `resetsInHours` is between 0 and 8760 and counts from the moment the fake runs.

An **entry** has a `role`, a `when` and its `attempts`. `when` is a non-empty text that must occur in the prompt for the entry to apply.

An **attempt** has `steps` (a list, possibly empty or absent) and an optional `final` text, the closing message of the attempt. An attempt without `final` closes with `Done.`. `attempts` holds at least one attempt.

A **step** is an object with exactly one key:

| Step | Effect |
|---|---|
| `{ "say": "text" }` | An assistant text message. |
| `{ "write": { "path": "dir/file", "content": "text" } }` | A `Write` tool call that creates or overwrites the file, creating its directories. |
| `{ "delete": "dir/file" }` | A `Bash` tool call of `rm -f <absolute path>` that removes the file. A missing file is not an error; a directory is. |

Paths are relative to the working directory of the run and cannot contain a `..` segment.

## Complete example

````json
{
  "signatures": {
    "challenger": "You examine a product request"
  },
  "usage": {
    "session": { "percent": 41, "resetsInHours": 2 },
    "weeklyAll": { "percent": 63, "resetsInHours": 70 },
    "weeklyScoped": [{ "model": "Opus", "percent": 12, "resetsInHours": 70 }]
  },
  "entries": [
    {
      "role": "implementer",
      "when": "Add a sum function",
      "attempts": [
        {
          "steps": [
            { "say": "Reading the specification." },
            { "write": { "path": "src/sum.ts", "content": "export function sum(a: number, b: number): number {\n  return a - b;\n}\n" } }
          ],
          "final": "Added sum."
        },
        {
          "steps": [
            { "say": "The gate rejected the first version; fixing the operator." },
            { "write": { "path": "src/sum.ts", "content": "export function sum(a: number, b: number): number {\n  return a + b;\n}\n" } },
            { "delete": "src/scratch.txt" }
          ],
          "final": "Fixed sum after the gate feedback."
        }
      ]
    },
    {
      "role": "implementer",
      "when": "Document the release process",
      "attempts": [
        {
          "steps": [{ "write": { "path": "docs/release.md", "content": "# Release\n\nTag the commit, then publish.\n" } }],
          "final": "Documented the release process."
        }
      ]
    }
  ],
  "fallback": {
    "reviewer": {
      "attempts": [
        {
          "final": "One gap.\n\n```json\n{ \"findings\": [{ \"severity\": \"blocking\", \"category\": \"correctness\", \"file\": \"src/sum.ts\", \"line\": 2, \"summary\": \"sum(1, 2) returns -1\" }] }\n```"
        }
      ]
    }
  }
}
````

With this scenario, an implementer prompt that mentions `Add a sum function` plays the first entry. When the Stop hook rejects the first attempt, the second attempt plays in the same session, and a later `--resume` of that session finds both attempts used. A reviewer prompt gets the fallback report. An auditor prompt, which has neither entry nor fallback, gets the built-in verdict `keep`.

## Choosing what to play

The role is the one whose signature occurs earliest in the prompt; among signatures that start at the same place the longest wins. A diff or a specification that quotes another role's signature later in the prompt does not change the role.

Within the role, the first entry whose `when` occurs in the prompt is played; entries of other roles are never considered. Without a match, the `fallback` of the role applies, and without one the built-in behaviour of the role does:

| Role | Built-in behaviour |
|---|---|
| `reviewer` | A short text and a `json` block `{ "findings": [] }`. |
| `auditor` | A short text and a `json` block with verdict `keep`, no finding, `proposedFix: null`. |
| `challenger` | A short text and a `json` block with one item of verdict `keep`, no specification and a reply. |
| `acceptance-author`, `implementer` | A short text and no file change. |
| a prompt that matches no signature | The text `Nothing to do.` and no file change. |

## Attempts, sessions and the Stop hook

A session is created when a run starts and lives in `<state>/sessions/<session id>.json`, with the entry or fallback it plays and the number of attempts used. Session ids are UUID-shaped and derive from the number of sessions the state directory has held, so the first session of a fresh state directory has the same id every time. Concurrent processes can share one state directory.

A run plays one attempt, then runs every `Stop` hook of the settings with the payload the CLI sends (`session_id`, `transcript_path`, `cwd`, `permission_mode`, `effort`, `prompt_id`, `hook_event_name`, `stop_hook_active`, `last_assistant_message`). A hook blocks the stop when it exits with code 2, or when its standard output is a JSON object `{ "decision": "block", "reason": "..." }`.

- When a hook blocks and the run has honoured fewer blocks than the cap, the fake prints a synthetic user turn `Stop hook feedback:\n[<command>]: <reason>\n` (one line per blocking hook), plays the next attempt of the same session, and runs the Stop hooks again with `stop_hook_active` set to `true`.
- When no attempt is left, the fake states the final text of the last attempt again.
- When a hook blocks and the cap is reached, the run ends. The hook has run once more than the number of blocks honoured, and each run of a hook prints exactly one `hook_response`.
- The cap is `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, 2 by default. Each run counts its own blocks.

`--resume <session>` loads the session, plays its next unused attempt, and keeps the entry the session started from whatever the new prompt says. A session whose attempts are all used states the last final text again. A resumed run is a new run: it prints its own `init`, `rate_limit_event` and `result`, its identifiers do not repeat those of earlier runs, and `stop_hook_active` starts at `false`.

`<state>/transcripts/<session id>.jsonl` receives every line the session printed; its path is the `transcript_path` given to hooks.

## Hooks

`PreToolUse` hooks run before every tool call, `Write` and `Bash` alike. A group applies when its `matcher`, a regular expression matched against the whole tool name, matches; an absent, empty or `*` matcher applies to every tool. Each matching hook runs as `/bin/sh -c <command>` in the working directory, with `CLAUDE_PROJECT_DIR` in its environment and the JSON payload on standard input (`session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`). All matching hooks run; the call is denied when any of them exits with code 2 or prints `{ "hookSpecificOutput": { "permissionDecision": "deny", "permissionDecisionReason": "..." } }`.

A denied call prints, in order, a `permission_denied` system line, then a `user` line whose `tool_result` has `is_error: true` and the reason as its content. The file is not written and the run goes on with the next step.

A hook that outlives its `timeout` (seconds, default 600) is killed and does not block. A hook's answer is complete when its shell exits: a background process it leaves behind is not waited for. Hooks stay in the process group of the fake, so terminating the group terminates them.

Every hook execution prints a `hook_started` line and a `hook_response` line (`hook_id`, `hook_name`, `hook_event`, `output`, `stdout`, `stderr`, `exit_code`, `outcome`). `output` is standard output followed by standard error; `outcome` is `success` for exit code 0 and `error` otherwise. `hook_name` is `PreToolUse:<tool>` or `Stop`.

## Stream lines

| Line | When |
|---|---|
| `system` / `init` | First. `session_id`, `model`, `cwd`, `tools`, `permissionMode` and the usual descriptive fields. |
| `rate_limit_event` | Once per run, second. `unifiedWindows.five_hour` and `seven_day` with `utilization` as a ratio and `resetsAt` in epoch seconds. |
| `assistant` | One per `say`, per tool call and per closing message. Carries `message.id`, `message.usage` and `parent_tool_use_id: null`. |
| `system` / `hook_started`, `hook_response` | Around every hook execution. |
| `system` / `permission_denied` | Before the error result of a denied tool call. |
| `user` | A `tool_result` per tool call; a synthetic text turn per honoured Stop block. |
| `result` | Last. `subtype: "success"`, `is_error: false`, `session_id`, `result` (the last assistant text), `num_turns`, `duration_ms`, `total_cost_usd`, `usage`, `permission_denials`. |

There are no `stream_event` partial messages and no thinking blocks.

## Accounting

Every assistant line is one message and one turn. Tokens, cost and durations are computed from the work done with the constants of `src/metering/metering.ts`:

- a message reads the whole context built so far from the cache, creates in the cache what was appended since the previous message (the prompt for the first message, then tool results and hook feedback), and bills a fixed number of fresh input tokens;
- its output tokens are a fixed amount plus one token per four characters of what it said or of the tool input it sent;
- `result.usage` is the sum over the messages, so the usage tally of the factory reaches the same figures;
- the cost applies a fixed price per million tokens to each kind of token;
- the durations add a fixed time per message, per output token and per executed tool call. Nothing sleeps.

## What is not emulated

Permission rules (`permissions.allow`, `permissions.deny`), the sandbox settings, `--max-turns` and `--max-budget-usd`, MCP servers, tools other than `Write` and `Bash`, hook events other than `PreToolUse` and `Stop`, the `/login` flow, and every slash command other than `/usage` are not emulated. Only the file or JSON given to `--settings` is read; the project and local settings files that `--setting-sources` selects never are. The `--model` value is echoed as given.

## Layout and tests

```text
src/
  main.ts            entry point (the `fake-claude` bin)
  cli/               command line, standard input, exit handling
  scenario/          scenario model, validation, role detection, script selection, built-in answers
  usage-report/      the /usage lines, their summary and the rate limit figures
  session/           session records and their file store
  hooks/             settings, hook execution, decisions, payloads
  run/               the orchestration of a run: stage, tool calls, narration
  stream/            the stream vocabulary, the line builders and the output sinks
  metering/          tokens, cost and durations
  ids/               deterministic identifiers
  workspace/         the working tree the steps act on
  json/              validation helpers with field paths
  test-support/      helpers shared by the tests
  *.test.ts          tests, all at this level so that `src/*.test.ts` finds them
```

```sh
cd packages/fake-claude
node --test src/*.test.ts       # or: pnpm run test
tsc --noEmit -p tsconfig.json   # or: pnpm run typecheck
```

The tests spawn `node src/main.ts` in temporary directories. `factory-contract.test.ts` reads the output with the stream schemas and parser of `packages/adapters`, drives the real `stop-gate` and `frozen-write-guard` hooks of `packages/plugin`, and parses the built-in role answers with the parsers of `packages/application`.
