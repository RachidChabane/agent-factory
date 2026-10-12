# shellcheck shell=bash
# Shared by the scripts that open the built cockpit in a browser. Sourced after script/lib/heavy.sh.

# Builds the cockpit when its build is missing or older than its sources.
ensure_cockpit_build() {
  local dist="packages/cockpit/dist/index.html"
  if [ ! -f "$dist" ] || [ -n "$(find packages/cockpit/src packages/cockpit/index.html packages/cockpit/vite.config.ts packages/cockpit/package.json -type f -newer "$dist" -print -quit)" ]; then
    run_heavy pnpm --filter @agent-factory/cockpit run build
  fi
}
