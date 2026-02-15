#!/usr/bin/env bash
#
# Release todu: bump versions, commit, tag, push, verify.
#
# Usage:
#   ./release.sh <version>   (e.g., 1.2.0)
#
# This script handles the mechanical release steps:
#   1. Validate on main with no unpushed commits
#   2. Update version in all package.json files
#   3. Commit CHANGELOG.md + package.json files
#   4. Create annotated tag
#   5. Push commit and tag
#   6. Verify tag exists on remote
#
# Prerequisites:
#   - CHANGELOG.md must already be updated (agent does this conversationally)
#   - All checks must pass (agent verifies in pre-flight)
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

die() { echo -e "${RED}Error: $1${NC}" >&2; exit 1; }
info() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }

# --- Validate arguments ---
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.2.0"
  exit 1
fi

NEW_VERSION="$1"
NEW_TAG="v${NEW_VERSION}"

# Validate version format
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  die "Invalid version format: $NEW_VERSION (expected X.Y.Z or X.Y.Z-suffix)"
fi

# --- Step 1: Validate branch and state ---
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  die "Must be on main branch (currently on '$CURRENT_BRANCH')"
fi

git fetch origin main --quiet
UNPUSHED=$(git log origin/main..HEAD --oneline)
if [[ -n "$UNPUSHED" ]]; then
  die "Unpushed commits on main:\n$UNPUSHED\n\nPush these first."
fi

# Check tag doesn't already exist
if git tag --list | grep -q "^${NEW_TAG}$"; then
  die "Tag $NEW_TAG already exists locally"
fi
if git ls-remote --tags origin | grep -q "refs/tags/${NEW_TAG}$"; then
  die "Tag $NEW_TAG already exists on remote"
fi

info "Releasing: $NEW_TAG"

# --- Step 2: Update versions in all package.json files ---
PACKAGES=(
  "package.json"
  "packages/core/package.json"
  "packages/engine/package.json"
  "packages/cli/package.json"
  "packages/electron/package.json"
)

for pkg in "${PACKAGES[@]}"; do
  if [[ ! -f "$pkg" ]]; then
    die "$pkg not found"
  fi
  CURRENT=$(node -p "require('./$pkg').version")
  if [[ "$CURRENT" != "$NEW_VERSION" ]]; then
    info "Updating $pkg: $CURRENT -> $NEW_VERSION"
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
      pkg.version = '$NEW_VERSION';
      fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2) + '\n');
    "
  else
    warn "$pkg already at $NEW_VERSION"
  fi
done

# Also update electron-builder electronVersion if needed
# (this stays pinned to the installed electron version, not the app version)

# --- Step 3: Commit ---
git add CHANGELOG.md
for pkg in "${PACKAGES[@]}"; do
  git add "$pkg"
done

# Check if there are changes to commit
if git diff --cached --quiet; then
  warn "No changes to commit"
else
  git commit -m "chore: release v${NEW_VERSION}" --no-verify
  info "Committed release v${NEW_VERSION}"
fi

# --- Step 4: Create annotated tag ---
git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
info "Created tag: $NEW_TAG"

# --- Step 5: Push ---
info "Pushing to origin..."
git push origin main --follow-tags

# --- Step 6: Verify tag on remote ---
info "Verifying tag on remote..."
sleep 2

if ! git ls-remote --tags origin | grep -q "refs/tags/${NEW_TAG}$"; then
  die "Tag $NEW_TAG was NOT pushed to remote!\n\nManually push with: git push origin $NEW_TAG"
fi

info ""
info "✅ Released $NEW_TAG"
info "✅ Tag verified on remote"
info ""
info "GitHub Actions will now build artifacts and create the release."
info "Monitor at: gh run list --limit 1"
