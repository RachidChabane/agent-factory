# Security

Report vulnerabilities privately through
[GitHub's vulnerability reporting](https://github.com/RachidChabane/agent-factory/security/advisories/new),
not in a public issue. Expect an answer within a week.

Fixes are made on the latest release.

Worth knowing when you assess a report:

- The configuration file (`~/.agent-factory/config.yaml`) is as trusted as a
  project's own build scripts: its setup and gate commands run on the operator's
  machine.
- Agent runs and every command that executes code an agent wrote (setup, gate,
  acceptance checks) run confined: no credential store is readable, writes stay in
  the worktree and declared directories, and the network is closed unless a command
  declares why it needs it. Confinement uses `sandbox-exec` on macOS and bubblewrap
  on Linux. A way out of that confinement is a vulnerability.
- Agents hold no forge token. Every outward write (push, pull request, merge,
  release, redeploy, notification) is performed by the factory's own code, and only
  on the operator's order where the documentation says so.
- The server listens on the loopback interface by default. Every command needs a
  per-process token that only the cockpit page carries. With remote access enabled,
  the server trusts the identity header set by `tailscale serve` on the same host.
