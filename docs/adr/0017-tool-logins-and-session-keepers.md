# ADR 0017: Start tool logins and keep tool sessions alive from the configuration

Status: accepted
Date: 2026-10-12

## Context

ADR 0014 checks the command-line tools a project relies on with declarative,
read-only commands, and shows a fix command when a check fails. Two needs remain:

- several tools log in through the browser (single sign-on, OIDC): the operator has
  to open a terminal and type the right variant of the login, and the wrong one asks
  for a pasted token;
- some sessions expire on a short cap that no renewal extends, so a long unattended
  run finds its tools logged out.

## Options

1. **Hard-code logins and renewals per known tool.** Ties the product to a list of
   vendors and to one company's habits.
2. **Leave both to the operator's own scripts and schedulers.** The factory then shows
   a tool as logged out without offering to fix it, and nobody sees whether the
   session keeper ran.
3. **Declare both per tool**: `login`, a command that needs no terminal, which the
   cockpit and `agent-factory tool login <name>` start; and `keepAlive`
   (`command`, `everyMinutes`), which the running factory runs on schedule.

## Decision

Option 3.

- Both commands run as the operator would run them from a terminal, without one: in
  the operator's home, with their environment, no standard input, outside the
  sandbox, since a login writes the tool's credentials. `loginTimeoutSeconds`
  (default 300, for a browser sign-on) and `keepAlive.timeoutSeconds` (default 120)
  bound them.
- What the commands print is never kept, because a login may print the credential it
  obtained: an event records only how the command ended (`succeeded`, `failed` with
  its exit code, or `timed-out`), who ran it and when.
- After each login or keep-alive the tool is checked again, so the cockpit shows the
  resulting status next to the run that produced it.
- Every keep-alive runs once when the factory starts, which checks each session at
  start-up, then once per its interval.

## Consequences

- The cockpit can offer a Log in button whose effect is the declared command, started
  on the factory's machine: with remote access, the browser opens there, not on the
  device showing the cockpit.
- A tool without `login` keeps its fix command as text; the Log in action refuses it.
- Keep-alive commands are the operator's, and so is their effect: the factory records
  each run and its outcome, and warns in its log when one fails.
