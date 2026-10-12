# ADR 0034: Notifications link a pull request's media through an upload command the operator declares

Status: accepted
Date: 2026-10-12

## Context

A pull request ready to merge is best judged from its films and screenshots. The
operator often reads the notification on a phone, in a chat. Chat webhooks cannot attach
files. A chat cannot show an image that lives in a private repository. The cockpit can
show the media, but only where the cockpit is reachable.

## Options

1. **Link the cockpit and the forge only.** Nothing to set up, but nothing to see from
   where the notification is read.
2. **Upload to a storage service built into the factory.** Every service has its own API
   and credentials, and the factory would hold one more secret.
3. **An upload command the operator declares.** It takes a file and prints a link the
   operator can open, in whatever storage the operator already uses, with the
   operator's own login.

## Decision

Option 3. `notifications.media` declares `upload`, an argument template with `{file}`,
and its `timeoutSeconds`.

- **Upload.** When a pull request becomes ready to merge, the factory runs the command
  once for each film and final screenshot of the pull request. The last line the
  command prints is the link.
- **Notification.** The "ready to merge" notice lists the links, labelled by scenario
  and phase.
- **Cache.** A file already uploaded is not uploaded again; links are kept per file
  content.
- **Failure.** An upload that fails or times out leaves its link out. The operation log
  says why, and the notice still goes out.
- **Confinement.** The command runs outside the sandbox, with the operator's
  environment, like the film command. `validate` says so on the `notifications` line.

## Consequences

- The operator sees the before and after from the chat, in storage they control.
- The factory holds no storage credential; the declared command uses the operator's
  login.
- Without `notifications.media`, notices link the cockpit and the forge.
