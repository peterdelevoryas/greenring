#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-5173}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:3000}"

cd "$ROOT_DIR/web"
exec npm run dev -- --host 127.0.0.1 --port "$PORT"
