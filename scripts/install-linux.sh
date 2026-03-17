#!/usr/bin/env bash
# Install todu on Linux via AppImage + .desktop integration.
# Run from the project root after `make dist`.
set -euo pipefail

APPIMAGE=$(find dist/installers -name 'todu-*-linux-x86_64.AppImage' 2>/dev/null | sort -V | tail -1 || true)
if [[ -z "$APPIMAGE" ]]; then
  echo "error: no AppImage found in dist/installers/ — run 'make dist' first"
  exit 1
fi

ICON_SRC="packages/electron/build/icons/256x256.png"
INSTALL_DIR="$HOME/Applications"
ICON_DIR="$HOME/.local/share/icons"
DESKTOP_DIR="$HOME/.local/share/applications"

echo "Installing todu from $APPIMAGE..."

mkdir -p "$INSTALL_DIR" "$ICON_DIR" "$DESKTOP_DIR"

cp "$APPIMAGE" "$INSTALL_DIR/todu.AppImage"
chmod +x "$INSTALL_DIR/todu.AppImage"

cp "$ICON_SRC" "$ICON_DIR/todu.png"

cat > "$DESKTOP_DIR/todu.desktop" << EOF
[Desktop Entry]
Name=todu
Comment=Local-first task management
Exec=$INSTALL_DIR/todu.AppImage
Icon=todu
Terminal=false
Type=Application
Categories=Office;ProjectManagement;
StartupWMClass=todu
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo "Installed: $INSTALL_DIR/todu.AppImage"
echo "Search 'todu' in your app menu to launch it."
