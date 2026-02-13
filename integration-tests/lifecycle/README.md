# Electron App Lifecycle Tests

Tests for Electron app startup, navigation, keyboard shortcuts, empty states, and cross-cutting behavior.

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## Tests

- [startup.md](startup.md) — Clean launch, console errors, initial state
- [navigation.md](navigation.md) — Sidebar nav, view switching, back buttons
- [empty-states.md](empty-states.md) — All views with no data
- [keyboard-shortcuts.md](keyboard-shortcuts.md) — Ctrl+N, Ctrl+K, Escape
- [sync.md](sync.md) — CLI↔Electron sync server, concurrent modifications
- [dialogs.md](dialogs.md) — Dialog open/close behavior across all views

## Notes

Some lifecycle features are main process only and not testable via CDP:
- **Tray icon/menu** — requires OS-level interaction
- **Close → minimize to tray** — `BrowserWindow.hide()` happens in main process
- **Ctrl+Shift+T global shortcut** — registered via `globalShortcut`, not renderer
- **App quit** — terminates the process

These features require manual testing or Electron-specific test tooling.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
