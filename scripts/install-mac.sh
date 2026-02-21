#!/usr/bin/env bash
# Install toduai on macOS by mounting the .dmg and copying to /Applications.
# Run from the project root after `make dist`.
set -euo pipefail

DMG=$(ls dist/installers/toduai-*-mac*.dmg 2>/dev/null | sort -V | tail -1)
if [[ -z "$DMG" ]]; then
  echo "error: no .dmg found in dist/installers/ — run 'make dist' first"
  exit 1
fi

echo "Installing toduai from $DMG..."

MOUNT=$(hdiutil attach "$DMG" -nobrowse -quiet | awk 'END {print $NF}')
cp -R "$MOUNT/toduai.app" /Applications/
hdiutil detach "$MOUNT" -quiet

echo "Installed: /Applications/toduai.app"
