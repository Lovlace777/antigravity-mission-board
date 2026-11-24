#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js 22.5+ is required. Please install Node.js 22 LTS from https://nodejs.org/"
  exit 1
fi

if [ ! -d "server/node_modules" ]; then
  echo "[setup] Installing server dependencies..."
  npm --prefix server install
fi

if [ ! -d "web/node_modules" ]; then
  echo "[setup] Installing web dependencies..."
  npm --prefix web install
fi

if [ ! -f "server/dist/server/src/index.js" ]; then
  echo "[build] Building server..."
  npm --prefix server run build
fi

if [ ! -f "web/dist/index.html" ]; then
  echo "[build] Building frontend..."
  npm --prefix web run build
fi

PORT_NUM="${PORT:-3777}"
URL="http://127.0.0.1:${PORT_NUM}"

echo "Starting Antigravity Mission Board at ${URL} ..."

(
  sleep 1.5
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
) &

exec node --no-warnings=ExperimentalWarning server/dist/server/src/index.js "$@"
