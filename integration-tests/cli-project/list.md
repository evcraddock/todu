# Test: List Projects

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

todu project create --name "Alpha" --priority high
todu project create --name "Beta" --priority low
todu project create --name "Gamma" --priority medium
```

## 1. List All (CLI)

```bash
todu project list --no-color
```

**Expected:** All 3 projects shown with correct priorities.

```
ID             Name   Status  Priority
──────────────────────────────────────
proj-XXXXXXXX  Alpha  active  high    
proj-XXXXXXXX  Beta   active  low     
proj-XXXXXXXX  Gamma  active  medium  
```

## 2. List with Status Filter (CLI)

```bash
todu project update "Alpha" --status done
todu project list --status active --no-color
```

**Expected:** Only Beta and Gamma shown (Alpha is done).

## 3. List as JSON (CLI)

```bash
todu --format json project list
```

**Expected:** JSON array of 3 project objects.

## 4. Verify Electron Shows Same List

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
```

**Expected:** All 3 projects visible: "Alpha", "Beta", "Gamma".

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-list.png
```

**Expected:** Screenshot shows project table with all 3 projects, matching priorities and statuses.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
