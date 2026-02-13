# Test: Delete Label

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai label create --name bug --color "#ff0000"
toduai label create --name feature --color "#00ff00"
toduai label create --name docs
```

## 1. Delete by Name (CLI)

```bash
toduai label delete bug
```

**Expected:**

```
Deleted label: bug (lbl-XXXXXXXX)
```

## 2. Verify Deleted (CLI)

```bash
toduai label list --no-color
```

**Expected:** Only "feature" and "docs" shown.

## 3. Delete by ID (CLI)

```bash
LABEL_ID=$(toduai --format json label list | jq -r '.[] | select(.name == "docs") | .id')
toduai label delete "$LABEL_ID"
```

**Expected:** `Deleted label: docs (lbl-XXXXXXXX)`

## 4. Verify Electron Reflects CLI Deletions

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "feature" shown in table.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-delete-cli.png
```

## 5. Delete Cascades from Tasks (CLI)

```bash
toduai project create --name "App"
TASK=$(toduai --format json task create --title "Test task" --project "App" --label feature)
TASK_ID=$(echo "$TASK" | jq -r .id)

# Verify label is on the task
toduai task show "$TASK_ID" --no-color | grep "Labels"
```

**Expected:** `Labels: feature`

```bash
toduai label delete feature

# Verify label is removed from the task
toduai task show "$TASK_ID" --no-color | grep "Labels"
```

**Expected:** `Labels: (none)`

## 6. Delete Label from Electron

Create a new label, then delete it via the Electron UI.

```bash
toduai label create --name temp --color "#3b82f6"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows "temp" label.

```bash
# Click the Delete button in the actions column
NODE_PATH=$NODE_PATH node $INTERACT click ".cell-actions .btn-danger"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-delete-confirm.png
```

**Expected:** ConfirmDialog: "Delete 'temp'? This cannot be undone."

```bash
# Confirm deletion
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-danger"
NODE_PATH=$NODE_PATH node $INTERACT wait ".empty-state" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-delete-empty.png
```

**Expected:** Returns to label list. Empty state: "No labels yet".

## 7. Verify CLI Sees Electron Deletion

```bash
toduai label list --no-color
```

**Expected:** `No results.`

## 8. Electron Delete with Task Cascade Warning

```bash
toduai label create --name important --color "#ef4444"
toduai task create --title "Important task" --project "App" --label important

NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000

# Click Delete on the label that has tasks
NODE_PATH=$NODE_PATH node $INTERACT click ".cell-actions .btn-danger"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-delete-cascade.png
```

**Expected:** ConfirmDialog shows cascade warning: "This label is used on 1 task. Removing 'important' will remove it from those tasks."

```bash
# Cancel the deletion
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

**Expected:** Dialog closes. Label still present.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
