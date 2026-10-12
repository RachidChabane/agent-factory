# Shared by the scripts that start heavy work (installs, builds, test suites, browsers).
# Sourcing it refuses to continue while the machine is short of memory, and
# `run_heavy` runs a command at a lower scheduling priority.

readonly HEAVY_MIN_FREE_PERCENT="${AGENT_FACTORY_MIN_FREE_MEMORY_PERCENT:-40}"
readonly HEAVY_NICENESS="${AGENT_FACTORY_NICENESS:-10}"
readonly MACOS_NORMAL_PRESSURE=1

free_memory_percent() {
  case "$(uname -s)" in
    Darwin)
      memory_pressure 2> /dev/null | awk -F': ' '/System-wide memory free percentage/ { gsub("%", "", $2); print $2 }'
      ;;
    Linux)
      awk '/^MemTotal:/ { total = $2 } /^MemAvailable:/ { available = $2 } END { if (total > 0) printf "%d\n", available * 100 / total }' /proc/meminfo
      ;;
    *)
      echo 100
      ;;
  esac
}

memory_pressure_is_normal() {
  case "$(uname -s)" in
    Darwin)
      [ "$(sysctl -n kern.memorystatus_vm_pressure_level 2> /dev/null || echo "$MACOS_NORMAL_PRESSURE")" = "$MACOS_NORMAL_PRESSURE" ]
      ;;
    *)
      return 0
      ;;
  esac
}

require_memory() {
  if [ "${AGENT_FACTORY_SKIP_MEMORY_GUARD:-}" = "1" ]; then
    return 0
  fi
  local free
  free="$(free_memory_percent)"
  if [ -n "$free" ] && [ "$free" -lt "$HEAVY_MIN_FREE_PERCENT" ]; then
    echo "refused: ${free}% of memory is free, below ${HEAVY_MIN_FREE_PERCENT}% (AGENT_FACTORY_MIN_FREE_MEMORY_PERCENT)" >&2
    exit 4
  fi
  if ! memory_pressure_is_normal; then
    echo "refused: memory pressure is not normal" >&2
    exit 4
  fi
}

run_heavy() {
  nice -n "$HEAVY_NICENESS" "$@"
}

require_memory
