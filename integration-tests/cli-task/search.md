# Test: Search Tasks

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

todu project create --name "App"
todu task create --title "Fix login bug" --project "App"
todu task create --title "Add search feature" --project "App"
todu task create --title "Update README" --project "App"
```

## 1. Search by Keyword (CLI)

```bash
todu task search "login" --no-color
```

**Expected:** Only "Fix login bug" shown.

## 2. Case-Insensitive Search (CLI)

```bash
todu task search "LOGIN" --no-color
```

**Expected:** Same result — finds "Fix login bug".

## 3. Search with Multiple Matches (CLI)

```bash
todu task search "e" --no-color
```

**Expected:** Multiple tasks matching (any task with "e" in the title).

## 4. Search with No Results (CLI)

```bash
todu task search "nonexistent" --no-color
```

**Expected:** `No results.`

## 5. Search as JSON (CLI)

```bash
todu --format json task search "login"
```

**Expected:** JSON array with matching tasks.

## 6. Verify Electron Search

Use the search input in the Tasks view.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-search-all.png
```

**Expected:** All 3 tasks visible.

```bash
# Type in the search input
NODE_PATH=$NODE_PATH node $INTERACT click ".search-input"
NODE_PATH=$NODE_PATH node $INTERACT type "login"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-search-login.png
```

**Expected:** Only "Fix login bug" shown in the table.

```bash
# Clear search and verify all tasks return
NODE_PATH=$NODE_PATH node $INTERACT press "Control+a"
NODE_PATH=$NODE_PATH node $INTERACT press "Backspace"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** All 3 tasks visible again.

## 7. Verify Ctrl+K Focuses Search

```bash
NODE_PATH=$NODE_PATH node $INTERACT press "Control+k"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.activeElement.className"
```

**Expected:** The focused element has class containing "search-input".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
