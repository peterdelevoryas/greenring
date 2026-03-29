#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.e2e}"

export GREENRING_COMPOSE_PROJECT_NAME="${GREENRING_COMPOSE_PROJECT_NAME:-greenring-e2e}"

wait_for_port() {
  local host="$1"
  local port="$2"
  local label="$3"

  for _ in $(seq 1 60); do
    if (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "timed out waiting for $label on $host:$port" >&2
  exit 1
}

"$ROOT_DIR/scripts/local-services.sh" reset "$ENV_FILE"
wait_for_port 127.0.0.1 5432 postgres

"$ROOT_DIR/scripts/bootstrap-owner.sh" "$ENV_FILE" owner "Party Owner" "change-me-now"
