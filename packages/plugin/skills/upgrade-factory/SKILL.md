---
name: upgrade-factory
description: Update the factory to its latest version without cutting any work short, by draining it, updating its clone, setting it up, validating it and starting it again. Use at a quiet moment when a new version exists.
---

# Upgrade the factory

`<clone>` is the directory that holds `script/factory`: the factory's clone.

## Before

1. `git -C <clone> fetch`, then `git -C <clone> log --oneline HEAD..@{upstream}`. Nothing listed means nothing to upgrade. Note `git -C <clone> rev-parse HEAD`.
2. `agent-factory status`. A quiet moment has no issue in `authoring-checks`, `checks-frozen`, `rewriting-check`, `implementing`, `gating`, `reviewing` or `producing-evidence`. The drain waits for them, so a busier moment only delays the upgrade.

## Upgrade

1. `agent-factory stop`. The factory takes no new work and exits once its running work is done. Never use `--now`: it cuts agents short.
2. Wait for the exit: `until agent-factory status | grep -q 'Factory: not running'; do sleep 10; done`. The watch prints `blocked cockpit-unreachable factory`: that is expected.
3. `git -C <clone> pull --ff-only`. When it fails, go to Start with the version you have.
4. `cd <clone> && script/setup` installs the dependencies from the lockfile and builds the cockpit.
5. `agent-factory validate` must exit 0. On a `FAIL` line, return to the noted version with `git -C <clone> checkout <noted commit>`, run `script/setup`, and tell the operator what failed.

## Start

`agent-factory start` does not return while the factory runs. Run it with Bash in the background, or with the Monitor tool, and keep its output. Then:

- `agent-factory status` prints `Factory: running`;
- the watch prints `cleared cockpit-unreachable factory`.

## The plugin

The factory and the plugin share a version. After the factory is back, run `claude plugin marketplace update agent-factory` and `claude plugin update agent-factory@agent-factory`, and tell the operator to restart the session: the skills of this session are the ones it started with.

Start the factory once: a second `agent-factory start` on the same home is refused while the first runs.
