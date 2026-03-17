#!/usr/bin/env bash
# Install todu on macOS by mounting the .dmg and copying to /Applications.
# Run from the project root after `make dist`.
set -euo pipefail

DMG=$(find dist/installers -name 'todu-*-mac*.dmg' 2>/dev/null | sort -V | tail -1 || true)
if [[ -z "$DMG" ]]; then
  echo "error: no .dmg found in dist/installers/ — run 'make dist' first"
  exit 1
fi

echo "Installing todu from $DMG..."

MOUNT=$(hdiutil attach "$DMG" -nobrowse | awk '/\/Volumes\// {print substr($0, index($0, "/Volumes"))}')
if [[ -z "$MOUNT" ]]; then
  echo "error: failed to mount $DMG"
  exit 1
fi

trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true' EXIT

cp -R "$MOUNT/todu.app" /Applications/

echo "Installed: /Applications/todu.app"
