#!/usr/bin/env bash
# Install todu on Linux via GitHub release AppImage + .desktop integration.
set -euo pipefail

REPO="evcraddock/todu"
VERSION="${1:-latest}"
INSTALL_DIR="${HOME}/.local/bin"
ICON_DIR="${HOME}/.local/share/icons"
DESKTOP_DIR="${HOME}/.local/share/applications"
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)
    APPIMAGE_ARCH="x64"
    ;;
  *)
    echo "error: unsupported Linux desktop architecture '$ARCH' (currently supported: x86_64)"
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
APPIMAGE_NAME="todu-${VERSION}-linux-${APPIMAGE_ARCH}.AppImage"
APPIMAGE_URL="${BASE_URL}/${APPIMAGE_NAME}"
TMP_DIR=$(mktemp -d)
APPIMAGE_PATH="${TMP_DIR}/${APPIMAGE_NAME}"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading ${APPIMAGE_URL}..."
curl -fL --progress-bar "$APPIMAGE_URL" -o "$APPIMAGE_PATH"

mkdir -p "$INSTALL_DIR" "$ICON_DIR" "$DESKTOP_DIR"
install -m 755 "$APPIMAGE_PATH" "$INSTALL_DIR/todu.AppImage"

cat > "$DESKTOP_DIR/todu.desktop" <<EOF
[Desktop Entry]
Name=todu
Comment=Local-first task management
Exec=${INSTALL_DIR}/todu.AppImage
Icon=todu
Terminal=false
Type=Application
Categories=Office;ProjectManagement;
StartupWMClass=todu
EOF

cat > "$ICON_DIR/todu.svg" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="todu icon">
  <rect width="256" height="256" rx="48" fill="#1f6feb"/>
  <path d="M64 78h128v20H64zm0 40h128v20H64zm0 40h84v20H64z" fill="#ffffff"/>
  <circle cx="176" cy="168" r="24" fill="#ffffff"/>
  <path d="m168 168 6 6 14-18" fill="none" stroke="#1f6feb" stroke-linecap="round" stroke-linejoin="round" stroke-width="8"/>
</svg>
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo "Installed: ${INSTALL_DIR}/todu.AppImage"
echo "Launch with: ${INSTALL_DIR}/todu.AppImage"
echo "Or search 'todu' in your app menu."
