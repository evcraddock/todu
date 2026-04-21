#!/usr/bin/env bash
# Install todu on macOS by downloading the GitHub release DMG and copying to /Applications.
set -euo pipefail

REPO="evcraddock/todu"
VERSION="${1:-latest}"
ARCH=$(uname -m)
APP_NAME="todu.app"
TARGET_PATH="/Applications/${APP_NAME}"

case "$ARCH" in
  arm64)
    DMG_ARCH="arm64"
    ;;
  x86_64)
    DMG_ARCH="x64"
    ;;
  *)
    echo "error: unsupported macOS architecture '$ARCH'"
    exit 1
    ;;
esac

if [[ "$VERSION" == "latest" ]]; then
  TAG=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" | sed 's#/$##' | awk -F/ '{print $NF}')
  if [[ -z "$TAG" ]]; then
    echo "error: failed to resolve latest todu release tag"
    exit 1
  fi
  VERSION="${TAG#v}"
else
  TAG="v${VERSION#v}"
  VERSION="${VERSION#v}"
fi

BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"
DMG_NAME="todu-${VERSION}-mac-${DMG_ARCH}.dmg"
DMG_URL="${BASE_URL}/${DMG_NAME}"
TMP_DIR=$(mktemp -d)
DMG_PATH="${TMP_DIR}/${DMG_NAME}"
MOUNT=""
trap 'if [[ -n "$MOUNT" ]]; then hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; fi; rm -rf "$TMP_DIR"' EXIT

echo "Downloading ${DMG_URL}..."
curl -fL --progress-bar "$DMG_URL" -o "$DMG_PATH"

echo "Mounting ${DMG_NAME}..."
MOUNT=$(hdiutil attach "$DMG_PATH" -nobrowse | awk '/\/Volumes\// {print substr($0, index($0, "/Volumes"))}' | tail -1)
if [[ -z "$MOUNT" ]]; then
  echo "error: failed to mount ${DMG_PATH}"
  exit 1
fi

if [[ ! -d "$MOUNT/${APP_NAME}" ]]; then
  echo "error: ${APP_NAME} not found in mounted DMG"
  exit 1
fi

echo "Installing to ${TARGET_PATH}..."
rm -rf "$TARGET_PATH"
ditto "$MOUNT/${APP_NAME}" "$TARGET_PATH"

echo "Installed: ${TARGET_PATH}"
echo "Launch with: open -a todu"
