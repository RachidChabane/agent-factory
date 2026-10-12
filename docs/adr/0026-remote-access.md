# ADR 0026: Remote access to the cockpit through Tailscale only

Status: accepted
Date: 2026-10-12

## Context

The operator sometimes follows and steers the factory away from the machine it runs
on, for example from a phone. The cockpit can merge pull requests and change settings,
so who reaches it matters.

## Options

1. **Listen on all interfaces with a password.** Another secret to manage, and the
   cockpit exposed to the network.
2. **A tunnel the operator sets up**, with the factory trusting whatever arrives.
3. **Loopback by default; Tailscale as the only remote path**, the identity of each
   request taken from the header Tailscale sets.

## Decision

Option 3. With `server.remoteAccess.kind: none` the factory admits only requests from
the machine itself, as its user, and ignores any identity header, since anyone can
write one. With `kind: tailscale` the factory still listens on loopback, the operator
publishes it on the tailnet with `tailscale serve`, every request must carry the login
header Tailscale sets, that login is the operator recorded in the events of what they
do, and `allowedLogins` restricts who gets in. Every command also needs the per-process token of the cockpit page
(ADR 0021).

## Consequences

- No password, no open port: remote access is the tailnet's own access control.
- Remote access is optional; an installation without Tailscale works on loopback.
