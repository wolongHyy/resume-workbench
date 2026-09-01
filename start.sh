#!/usr/bin/env bash
# Resume Workbench - cross-platform launcher for Linux & macOS.
# First-time:   npm install   (run once)
# Then:         ./start.sh   (or double-click start.command on macOS)
#
# Default URL: http://localhost:4000

set -e
cd "$(dirname "$0")"

# Pick the right Node tools.
if command -v npm >/dev/null 2>&1; then
  NPM=command -v npm
else
  echo "[error] npm not found. Install Node.js 18+ from https://nodejs.org"
  echo "        macOS Homebrew: brew install node@18
  echo "        Debian/Ubuntu: sudo apt install nodejs npm
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[1/2] Installing dependencies (first run, may take a minute)..."
  "$NPM" install --no-audit --no-fund
else
  echo "[1/2] Reusing node_modules."
fi

echo "[2/2] Starting Next.js on http://localhost:4000 ..."
exec "$NPM" run dev

