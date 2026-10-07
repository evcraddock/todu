#!/usr/bin/env bash
# Install todu on Apple Silicon macOS from the verified GitHub release DMG.
set -euo pipefail

REPO="evcraddock/todu"
VERSION="${1:-latest}"
ARCH=$(uname -m)
APP_NAME="todu.app"
TARGET_PATH="/Applications/${APP_NAME}"

case "$ARCH" in
  arm64)
    ;;
  x86_64)
    # A Rosetta shell reports x86_64; check the hardware before rejecting it.
    if ! HARDWARE_ARM64=$(sysctl -n hw.optional.arm64 2>/dev/null) || [[ "$HARDWARE_ARM64" != "1" ]]; then
      echo "error: todu requires Apple Silicon (arm64); Intel Macs are not supported."
      exit 1
    fi
    ;;
  *)
    echo "error: unsupported macOS architecture '$ARCH'; todu requires Apple Silicon (arm64)."
    exit 1
    ;;
esac
DMG_ARCH="arm64"

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
curl -fL "${BASE_URL}/SHA256SUMS.txt" -o "${TMP_DIR}/SHA256SUMS.txt"
awk -v name="$DMG_NAME" '$2 == name { print; found++ } END { if (found != 1) exit 1 }' "${TMP_DIR}/SHA256SUMS.txt" > "${TMP_DIR}/download-checksum.txt"
(cd "$TMP_DIR" && shasum -a 256 -c download-checksum.txt)

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
