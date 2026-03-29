#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.local}"
USERNAME="${2:-owner}"
DISPLAY_NAME="${3:-Party Owner}"
PASSWORD="${4:-change-me-now}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"
exec cargo run -- bootstrap-owner \
  --username "$USERNAME" \
  --display-name "$DISPLAY_NAME" \
  --password "$PASSWORD"
