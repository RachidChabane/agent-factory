#!/usr/bin/env bash
# Runs inside the container script/test-linux starts: installs bubblewrap, then clones the repository mounted
# at /source and, as the unprivileged `node` user, sets it up, runs its tests and the example journey.
set -euo pipefail

readonly SOURCE=/source
readonly RUNNER_USER=node

apt-get update -qq
apt-get install -y -qq --no-install-recommends bubblewrap > /dev/null
corepack enable

# shellcheck disable=SC2016 # the script is expanded by the runner's own shell
runuser -u "$RUNNER_USER" -- env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -euo pipefail -c '
  source_directory="$1"
  shift
  git config --global --add safe.directory "$source_directory"
  git clone --quiet "$source_directory" "$HOME/work"
  cd "$HOME/work"
  script/setup
  script/test "$@"
  script/e2e-example
' linux-container "$SOURCE" "$@"
