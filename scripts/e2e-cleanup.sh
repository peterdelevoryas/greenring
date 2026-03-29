#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.e2e}"

export GREENRING_COMPOSE_PROJECT_NAME="${GREENRING_COMPOSE_PROJECT_NAME:-greenring-e2e}"
"$ROOT_DIR/scripts/local-services.sh" down "$ENV_FILE"
