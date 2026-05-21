#!/usr/bin/env bash
set -euo pipefail

# Remove the current CLI symlink created by the installer.
if [ -L /usr/local/bin/todu ]; then
  rm -f /usr/local/bin/todu
fi
