# Test: Note Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## 1. Add Note to Nonexistent Task (CLI)

```bash
todu note add "Orphan note" --task "task-nonexistent"
```

**Expected:**

```
Error: task not found: task-nonexistent
```

Exit code: 1

## 2. Add Note to Nonexistent Project (CLI)

```bash
todu note add "Orphan note" --project "Nonexistent"
```

**Expected:** `Project not found: Nonexistent`

## 3. List Notes for Nonexistent Project (CLI)

```bash
todu note list --project "Nonexistent"
```

**Expected:** `Project not found: Nonexistent`

## 4. Delete Nonexistent Note (CLI)

```bash
todu note delete "note-nonexistent"
```

**Expected:** `Error: note not found: note-nonexistent`

## 5. Electron Create — Empty Content Validation

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Note"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000

# Try to create without entering content
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-errors-empty.png
```

**Expected:** Error message "Content is required" shown in dialog. Dialog stays open.

## 6. Electron Create Button Disabled Without Content

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-actions .btn-primary').disabled"
```

**Expected:** Returns `true` — Create Note button is disabled when content is empty.

## 7. Electron Multi-Field Typing — Focus-Stealing Detection

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#note-content"
NODE_PATH=$NODE_PATH node $INTERACT type "Test note content"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#note-content').value"
```

**Expected:** Returns `"Test note content"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#note-tags"
NODE_PATH=$NODE_PATH node $INTERACT type "tag1, tag2"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#note-tags').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#note-content').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-errors-typing.png
```

**Expected:**
- Tags returns `"tag1, tag2"`
- Content still returns `"Test note content"` (unchanged)
- If content got corrupted, confirms focus-stealing bug (#1762) in CreateNoteDialog

```bash
# Close dialog
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
