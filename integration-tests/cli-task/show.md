# Test: Show Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

todu project create --name "My App"
TASK=$(todu --format json task create --title "Fix login" --project "My App" --priority high --description "Users can't log in with SSO")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## 1. Show Task (CLI)

```bash
todu task show "$TASK_ID"
```

**Expected:**

```
ID:          task-XXXXXXXX
Title:       Fix login
Status:      active
Priority:    high
Project:     My App
Labels:      (none)
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ

Description:
Users can't log in with SSO
```

## 2. Show as JSON (CLI)

```bash
todu --format json task show "$TASK_ID"
```

**Expected:** JSON object including `description` field.

## 3. Verify Electron Detail View

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=Fix login"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-show.png
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Detail view shows:
- Title: "Fix login"
- Status: active with status shortcuts (Start, Done, Cancel)
- Priority: high
- Project: My App
- Description: "Users can't log in with SSO"

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
