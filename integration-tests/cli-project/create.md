# Test: Create Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## 1. Create with Name Only (CLI)

```bash
toduai project create --name "My App"
```

**Expected:**

```
Project created:
ID:          proj-XXXXXXXX
Name:        My App
Status:      active
Priority:    medium
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
```

Defaults: status=active, priority=medium, sync=none.

## 2. Create with All Options (CLI)

```bash
toduai project create --name "Backend API" --priority high --description "REST API service"
```

**Expected:**

```
Project created:
ID:          proj-XXXXXXXX
Name:        Backend API
Status:      active
Priority:    high
Sync:        none
Created:     YYYY-MM-DDTHH:MM:SS.MMMZ
Updated:     YYYY-MM-DDTHH:MM:SS.MMMZ
Description: REST API service
```

## 3. Create with JSON Output (CLI)

```bash
toduai --format json project create --name "Frontend"
```

**Expected:** JSON with id, name, status, priority, syncStrategy, createdAt, updatedAt.

```json
{
  "id": "proj-XXXXXXXX",
  "name": "Frontend",
  "status": "active",
  "priority": "medium",
  "syncStrategy": "none",
  "createdAt": "YYYY-MM-DDTHH:MM:SS.MMMZ",
  "updatedAt": "YYYY-MM-DDTHH:MM:SS.MMMZ"
}
```

## 4. Verify CLI List

```bash
toduai project list --no-color
```

**Expected:** All three projects shown in table format.

## 5. Verify Electron Shows CLI-Created Projects

Navigate to Projects view and check that all three projects are visible.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
sleep 2
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Output contains "My App", "Backend API", and "Frontend".

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-create-cli.png
```

**Expected:** Screenshot shows all three projects in the table with correct status/priority.

## 6. Create Project in Electron

Open the "New Project" dialog, fill in the form, and submit.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Project"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-create-dialog.png
```

**Expected:** Screenshot shows the "New Project" dialog with Name, Priority, and Description fields.

```bash
NODE_PATH=$NODE_PATH node $INTERACT fill "#proj-name" "Electron Project"
NODE_PATH=$NODE_PATH node $INTERACT click "text=Create"
sleep 2
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-create-electron.png
```

**Expected:** Dialog closes. Project list now shows 4 projects including "Electron Project".

## 7. Verify CLI Sees Electron-Created Project

```bash
toduai project list --no-color
```

**Expected:** Four projects shown, including "Electron Project".

```bash
toduai project show "Electron Project" --no-color
```

**Expected:**

```
ID:          proj-XXXXXXXX
Name:        Electron Project
Status:      active
Priority:    medium
...
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
