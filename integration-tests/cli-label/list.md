# Test: List Labels

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"

toduai label create --name bug --color "#ff0000"
toduai label create --name feature --color "#00ff00"
toduai label create --name docs
```

## 1. List All (CLI)

```bash
toduai label list --no-color
```

**Expected:**

```
ID            Name     Color  
──────────────────────────────
lbl-XXXXXXXX  bug      #ff0000
lbl-XXXXXXXX  feature  #00ff00
lbl-XXXXXXXX  docs           
```

## 2. List as JSON (CLI)

```bash
toduai --format json label list
```

**Expected:** JSON array of label objects with id, name, color, createdAt.

## 3. Verify Electron Table

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table with columns Color, Name, Tasks, Actions. All 3 labels shown.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-list.png
```

## 4. Verify Task Count Column

```bash
toduai project create --name "App"
toduai task create --title "Fix crash" --project "App" --label bug
toduai task create --title "Fix login" --project "App" --label bug

NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-list-counts.png
```

**Expected:** "bug" row shows Tasks count = 2. "feature" and "docs" show 0.

## 5. Empty List

```bash
export TODUAI_DATA_DIR2=$(mktemp -d)
TODUAI_DATA_DIR="$TODUAI_DATA_DIR2" toduai label list --no-color
rm -rf "$TODUAI_DATA_DIR2"
```

**Expected:** `No results.`

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
