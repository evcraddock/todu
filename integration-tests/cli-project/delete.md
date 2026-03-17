# Test: Delete Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

todu project create --name "Delete Me"
todu project create --name "Keep Me"
todu project create --name "Also Delete"
```

## 1. Verify Initial State in Electron

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** All 3 projects visible.

## 2. Delete by Name (CLI)

```bash
todu project delete "Delete Me"
```

**Expected:**

```
Deleted project: Delete Me (proj-XXXXXXXX)
```

## 3. Verify CLI List After Delete

```bash
todu project list --no-color
```

**Expected:** Only "Keep Me" and "Also Delete" shown.

## 4. Verify Electron Reflects Deletion

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** "Delete Me" is gone. "Keep Me" and "Also Delete" remain.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-delete.png
```

## 5. Delete by ID (CLI)

```bash
PROJECT_ID=$(todu --format json project show "Also Delete" | jq -r '.id')
todu project delete "$PROJECT_ID"
```

**Expected:**

```
Deleted project: Also Delete (proj-XXXXXXXX)
```

## 6. Verify Only One Project Remains

```bash
todu project list --no-color
```

**Expected:** Only "Keep Me" shown.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** Only "Keep Me" in the Electron project list.

## 7. Delete Last Project, Verify Empty State

```bash
todu project delete "Keep Me"
todu project list --no-color
```

**Expected:**

```
No results.
```

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".empty-state" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-delete-empty.png
```

**Expected:** Electron shows the empty state: "No projects yet".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
