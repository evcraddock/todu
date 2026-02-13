# Test: Show Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai project create --name "My App" --priority high --description "Main application"
```

## 1. Show by Name (CLI)

```bash
toduai project show "My App"
```

**Expected:**

```
ID:          proj-XXXXXXXX
Name:        My App
Status:      active
Priority:    high
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
Description: Main application
```

## 2. Show by ID (CLI)

```bash
PROJECT_ID=$(toduai --format json project list | jq -r '.[0].id')
toduai project show "$PROJECT_ID"
```

**Expected:** Same output as above.

## 3. Show as JSON (CLI)

```bash
toduai --format json project show "My App"
```

**Expected:** JSON object with all project fields.

## 4. Verify Electron Detail View

Click into the project detail in Electron.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=My App"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-show.png
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Detail view shows project name "My App", priority "high", status "active", and description "Main application".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
