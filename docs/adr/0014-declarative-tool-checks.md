# ADR 0014: Connected tools as declarative checks

Status: accepted
Date: 2026-10-12

## Context

Agents and gate steps rely on command-line tools that must be installed and logged
in: the forge CLI, the Claude CLI, the sandbox, and whatever the project uses
(a cloud CLI, an observability CLI, a secrets manager, a design tool). Which tools
matter is a property of each project and each team, and an installation shows the
operator, before any run starts, whether each one is connected.

## Options

1. **A probe per known tool in the code.** Every new tool needs a release, and the
   list fits one organisation.
2. **No checks**, letting runs fail. The failure then surfaces late, inside an agent
   run, as a confusing error.
3. **Built-in checks for the tools the factory itself needs, and declarative checks
   for everything else.**

## Decision

Option 3.

- Built-in tools: `git`, `claude` and the command `sandbox` always; `gh` for
  projects whose forge is GitHub. Their probes live in the code because the
  factory knows exactly how to test them.
- Any other tool is declared in `tools` (installation-wide) or in a project's
  `tools`:

  ```yaml
  tools:
    - name: cloud
      description: Deploys the preview environments
      check: [cloud, auth, status]
      version: [cloud, --version]
      connectedPattern: "Logged in"
      fix: cloud auth login
      install: https://example.com/cloud-cli
      timeoutSeconds: 20
  ```

  The check must be read-only. A tool is `missing` when its command is not found,
  `unauthenticated` when the check fails or its output does not match
  `connectedPattern`, `connected` otherwise, and `error` on a timeout.
- Results are recorded as events with the time of the check; the cockpit lists
  every configured tool, including those never checked yet, each with its status,
  version, the time it was read and its `fix` hint, and can run a check on demand.

## Consequences

- Nothing about a particular company's tooling is in the code.
- A tool missing from the machine is visible in the cockpit and in
  `agent-factory validate` before it breaks a run.
- Probes run with the factory's environment, never inside an agent run.
