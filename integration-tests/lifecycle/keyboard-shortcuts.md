# Test: Keyboard Shortcuts

Verify renderer-level keyboard shortcuts work.

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

toduai project create --name "App"
toduai task create --title "Test task" --project "App"
```

## 1. Ctrl+K Focuses Search (Tasks View)

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click ".view-title"
NODE_PATH=$NODE_PATH node $INTERACT press "Control+k"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.activeElement.classList.contains('search-input')"
```

**Expected:** `true` — search input is focused.

```bash
NODE_PATH=$NODE_PATH node $INTERACT type "test"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.search-input').value"
```

**Expected:** Returns `"test"`.

```bash
# Clear search
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT press "Backspace"
```

## 2. Ctrl+N Opens Create Dialog (Tasks View)

```bash
NODE_PATH=$NODE_PATH node $INTERACT press "Control+n"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog-title"
```

**Expected:** "New Task" dialog opens.

```bash
# Close dialog
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

## 3. Ctrl+N is Global (Always "New Task")

Ctrl+N always opens "New Task" regardless of which view is active.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Control+n"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog-title"
```

**Expected:** "New Task" (not "New Project").

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Control+n"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog-title"
```

**Expected:** "New Task" (not "New Label").

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
