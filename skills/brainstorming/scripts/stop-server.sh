#!/usr/bin/env bash
set -e
if [[ $# -ne 1 ]]; then
  echo '{"error":"Usage: stop-server.sh <session_dir>"}' >&2
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/companion.cjs" stop --session-dir "$1"
