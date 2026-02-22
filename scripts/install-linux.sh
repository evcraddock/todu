#!/usr/bin/env bash
# Install toduai on Linux via AppImage + .desktop integration.
# Run from the project root after `make dist`.
set -euo pipefail

APPIMAGE=$(find dist/installers -name 'toduai-*-linux-x86_64.AppImage' 2>/dev/null | sort -V | tail -1 || true)
if [[ -z "$APPIMAGE" ]]; then
  echo "error: no AppImage found in dist/installers/ — run 'make dist' first"
  exit 1
fi

ICON_SRC="packages/electron/build/icons/256x256.png"
INSTALL_DIR="$HOME/Applications"
ICON_DIR="$HOME/.local/share/icons"
DESKTOP_DIR="$HOME/.local/share/applications"

echo "Installing toduai from $APPIMAGE..."

mkdir -p "$INSTALL_DIR" "$ICON_DIR" "$DESKTOP_DIR"

cp "$APPIMAGE" "$INSTALL_DIR/toduai.AppImage"
chmod +x "$INSTALL_DIR/toduai.AppImage"

cp "$ICON_SRC" "$ICON_DIR/toduai.png"

cat > "$DESKTOP_DIR/toduai.desktop" << EOF
[Desktop Entry]
Name=toduai
Comment=Local-first task management
Exec=$INSTALL_DIR/toduai.AppImage
Icon=toduai
Terminal=false
Type=Application
Categories=Office;ProjectManagement;
StartupWMClass=toduai
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo "Installed: $INSTALL_DIR/toduai.AppImage"
echo "Search 'toduai' in your app menu to launch it."
