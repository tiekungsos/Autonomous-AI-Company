#!/usr/bin/env bash
# Shared environment for the Autonomous AI Company scripts. Source, do not run.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
export ARCHON_HOME="${ARCHON_HOME:-$ROOT/data/archon-home}"
export ARCHON_PORT="${ARCHON_PORT:-3090}"
export BUN="${BUN:-$ROOT/.bun/bin/bun}"
export PATH="$(dirname "$BUN"):$PATH"
ARCHON_DIR="$ROOT/archon"
DATA_DIR="$ROOT/data"
LOG_DIR="$DATA_DIR/logs"
PID_FILE="$DATA_DIR/archon-server.pid"
SERVER_LOG="$LOG_DIR/archon-server.log"
API="http://127.0.0.1:$ARCHON_PORT/api"
mkdir -p "$LOG_DIR" "$ARCHON_HOME"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ok \033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mfail\033[0m %s\n' "$*"; }

server_pid() {
  if [ -f "$PID_FILE" ]; then
    local pid; pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then echo "$pid"; return 0; fi
  fi
  return 1
}

# Every descendant of a pid (depth first), so stopping the server also stops the
# provider plugins and agent CLIs it spawned, never anything else on the machine.
descendants() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do descendants "$child"; echo "$child"; done
}
kill_tree() {
  local pid="$1" sig="${2:-TERM}" p
  for p in $(descendants "$pid") "$pid"; do kill -s "$sig" "$p" 2>/dev/null || true; done
}
