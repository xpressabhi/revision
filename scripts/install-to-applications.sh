#!/bin/bash
set -euo pipefail
# Installs the freshly built .app to /Applications and refreshes tray
# Usage: npm run desktop:install  (builds then calls this) or ./scripts/install-to-applications.sh directly

APP_NAME="Revision.app"
SRC="dist/${APP_NAME}"
DEST="/Applications/${APP_NAME}"

if [ ! -d "${SRC}" ]; then
  echo "✗ Build output not found: ${SRC}"
  echo "  Run: npm run desktop:build"
  exit 1
fi

echo "→ Installing ${SRC} → ${DEST}"

# Quit running instance if any (so tray refreshes)
if pgrep -x "Revision" >/dev/null 2>&1 || pgrep -f "Revision.app/Contents/MacOS" >/dev/null 2>&1; then
  echo "→ Quitting running Revision..."
  osascript -e 'tell application "Revision" to quit' 2>/dev/null || true
  pkill -f "Revision.app/Contents/MacOS" 2>/dev/null || true
  sleep 1.5
fi

# Remove old and copy new (needs admin for /Applications on some Macs — will prompt if needed)
if [ -d "${DEST}" ]; then
  echo "→ Removing old ${DEST}"
  rm -rf "${DEST}" || sudo rm -rf "${DEST}"
fi

echo "→ Copying new bundle..."
cp -R "${SRC}" "${DEST}" || sudo cp -R "${SRC}" "${DEST}"

# Remove quarantine so macOS doesn't block
xattr -dr com.apple.quarantine "${DEST}" 2>/dev/null || true

# Touch to update Finder
touch "${DEST}" 2>/dev/null || true

echo "✓ Installed to ${DEST}"

echo "→ Launching..."

open "${DEST}" 2>/dev/null || true

echo "✓ Tray will refresh on next launch (icon + menu from new build)"
