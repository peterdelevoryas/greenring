#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${GREENRING_ENV_FILE:-$ROOT_DIR/.env.e2e}"

cleanup() {
  "$ROOT_DIR/scripts/e2e-cleanup.sh" "$ENV_FILE" || true
}

trap cleanup EXIT

"$ROOT_DIR/scripts/e2e-prepare.sh" "$ENV_FILE"

cd "$ROOT_DIR/web"
npx playwright test "$@"
