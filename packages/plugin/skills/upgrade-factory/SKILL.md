---
name: upgrade-factory
description: Update the factory to its latest version without cutting any work short, by waiting for a calm moment, draining it, updating its clone, setting it up, validating it and starting it again. Use when a new version exists.
---

# Upgrade the factory

`<clone>` is the directory that holds `script/factory`: the factory's clone.

## A calm moment

A moment is calm when a restart would cut nothing short: no agent run is open, no film is recording, and no issue is in a stage the factory runs by itself (freezing the checks, the gate, the evidence). `agent-factory status` says so: `Calm: yes`, or `Calm: no` followed by one line for each thing going on. A factory that is not running is calm.

The drain waits for all of that, so a moment that is not calm only delays the upgrade. Upgrade at a calm moment, and never use `agent-factory stop --now`: it stops the agents, whose issues resume from their last recorded step at the next start, and it fails the film that is recording.

## Before

1. `git -C <clone> fetch`, then `git -C <clone> log --oneline HEAD..@{upstream}`. Nothing listed means nothing to upgrade. Note `git -C <clone> rev-parse HEAD`.
2. Wait for a calm moment: `until agent-factory status | grep -q '^Calm: yes'; do sleep 30; done`.

## Upgrade

1. `agent-factory stop`. The drain suspends scheduling: no issue, challenge, audit or film starts, and the factory exits once its running work is done.
2. `agent-factory status` again. It lists `paused (drain)` among the pauses. `Calm: no` means work began between the first check and the drain; it finishes before the factory exits.
3. Wait for the exit: `until agent-factory status | grep -q 'Factory: not running'; do sleep 10; done`. The watch prints `blocked cockpit-unreachable factory`: that is expected.
4. `git -C <clone> pull --ff-only`. When it fails, go to Start with the version you have.
5. `cd <clone> && script/setup` installs the dependencies from the lockfile and builds the cockpit.
6. `agent-factory validate` must exit 0. On a `FAIL` line, return to the noted version with `git -C <clone> checkout <noted commit>`, run `script/setup`, and tell the operator what failed.

## Start

`agent-factory start` does not return while the factory runs. Run it with Bash in the background, or with the Monitor tool, and keep its output. Then check that the factory resumed:

- `agent-factory status` prints `Factory: running` and no `paused (drain)` among its pauses: the drain is lifted at start;
- the watch prints `cleared cockpit-unreachable factory`.

## What a restart does to films

A film still recording when the factory stops anyway fails with a reason that says the factory stopped. A film that waits stays queued, in its place, and records in its turn after the start. Order a failed film again with `agent-factory film <issue> --scenario <name>`.

## The plugin

The factory and the plugin share a version. After the factory is back, run `claude plugin marketplace update agent-factory` and `claude plugin update agent-factory@agent-factory`, and tell the operator to restart the session: the skills of this session are the ones it started with.

Start the factory once: a second `agent-factory start` on the same home is refused while the first runs.
