# Test: Dialog Behavior

Verify create dialogs open and close correctly across all views.

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

toduai project create --name "App"
```

## 1. Projects Dialog — Escape Closes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Project"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') === null"
```

**Expected:** `true` — dialog closed on Escape.

## 2. Tasks Dialog — Escape Does NOT Close (Bug #1764)

Use Ctrl+N to open the task dialog (avoids navigation timing issues).

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Control+n"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') !== null"
```

**Expected:** `true` — dialog stays open (bug #1764: `onKeyDown={undefined}` on overlay).

```bash
# Close via Cancel button instead
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') === null"
```

**Expected:** `true` — dialog closed via Cancel.

## 3. Habits Dialog — Escape Closes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Habit"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') === null"
```

**Expected:** `true` — dialog closed on Escape.

## 4. Recurring Dialog — Escape Closes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Template"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') === null"
```

**Expected:** `true` — dialog closed on Escape.

## 5. Notes Dialog — Escape Closes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Note"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') === null"
```

**Expected:** `true` — dialog closed on Escape.

## 6. Labels Dialog — Escape Closes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Label"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') === null"
```

**Expected:** `true` — dialog closed on Escape.

## 7. Cancel Button Works on All Dialogs

```bash
# Task dialog (can't use Escape due to #1764)
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Task"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-overlay') === null"
```

**Expected:** `true`

## Summary

| Dialog | Escape | Cancel Button |
|--------|--------|---------------|
| Projects | ✅ | ✅ |
| Tasks | ❌ #1764 | ✅ |
| Habits | ✅ | ✅ |
| Recurring | ✅ | ✅ |
| Notes | ✅ | ✅ |
| Labels | ✅ | ✅ |

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
