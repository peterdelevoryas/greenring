#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:-up}"
ENV_FILE="${2:-$ROOT_DIR/.env.local}"
PROJECT_NAME="${GREENRING_COMPOSE_PROJECT_NAME:-greenring-local}"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.local.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for local services" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose \
    -p "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

case "$ACTION" in
  up)
    compose up -d
    ;;
  down)
    compose down --remove-orphans
    ;;
  reset)
    compose down -v --remove-orphans
    compose up -d
    ;;
  logs)
    compose logs -f
    ;;
  *)
    echo "usage: $0 {up|down|reset|logs} [env-file]" >&2
    exit 1
    ;;
esac
