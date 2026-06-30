#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git fetch origin main
npm run release -- "$@"
npm run version-packages
