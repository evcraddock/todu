# Test: Delete Note

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

NOTE1=$(toduai --format json note add "Delete me")
NOTE1_ID=$(echo "$NOTE1" | jq -r .id)
NOTE2=$(toduai --format json note add "Keep me")
NOTE2_ID=$(echo "$NOTE2" | jq -r .id)
NOTE3=$(toduai --format json note add "Electron delete target")
NOTE3_ID=$(echo "$NOTE3" | jq -r .id)
```

## 1. Delete Note (CLI)

```bash
toduai note delete "$NOTE1_ID"
```

**Expected:**

```
Deleted note: note-XXXXXXXX
```

## 2. Verify Deleted (CLI)

```bash
toduai note list --no-color
```

**Expected:** Only "Keep me" and "Electron delete target" shown.

## 3. Verify Electron Reflects CLI Deletion

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Keep me" and "Electron delete target" in table.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-delete-cli.png
```

## 4. Delete Note from Electron

```bash
# Click Delete on the last row ("Electron delete target")
NODE_PATH=$NODE_PATH node $INTERACT click ".cell-actions .btn-danger >> nth=1"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-delete-confirm.png
```

**Expected:** ConfirmDialog: "Delete note 'Electron delete target...'? This cannot be undone."

```bash
# Confirm deletion
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-danger"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only "Keep me" remains.

## 5. Verify CLI Sees Electron Deletion

```bash
toduai note list --no-color
```

**Expected:** Only "Keep me" shown.

## 6. Delete Last Note — Empty State

```bash
toduai note delete "$NOTE2_ID"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".empty-state" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".empty-state"
```

**Expected:** "No notes found"

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
