#!/usr/bin/env bash
# Shared lifecycle: Node handles detach, reuse, and recovery.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/companion.cjs" start "$@"
