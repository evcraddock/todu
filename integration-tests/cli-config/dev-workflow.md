# Test: Dev Config Workflow

End-to-end workflow: use a dev config to create data via CLI, then verify the Electron app sees it.

## Setup

```bash
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js
PROJECT_ROOT=$(pwd)

WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"
toduai config init
CONFIG="$WORK_DIR/.toduai/config.yaml"
```

## 1. Create Data via Dev Config (CLI)

```bash
toduai --config "$CONFIG" project create --name "Dev App"
toduai --config "$CONFIG" task create --title "Setup build" --project "Dev App"
toduai --config "$CONFIG" task create --title "Write tests" --project "Dev App"
toduai --config "$CONFIG" label create --name bug --color "#ff0000"
toduai --config "$CONFIG" task list --no-color
```

**Expected:** Both tasks shown in table format.

## 2. Verify Data Isolation

```bash
ls "$WORK_DIR/.toduai/data/todu-catalog.id"
```

**Expected:** File exists in the dev config's data dir.

## 3. JSON Config Show

```bash
toduai --config "$CONFIG" --format json config show
```

**Expected:**

```json
{
  "configPath": "/path/to/.toduai/config.yaml",
  "configSource": "--config flag",
  "configExists": true,
  "dataDir": "/path/to/.toduai/data",
  "dataDirSource": "config file (/path/to/.toduai/config.yaml)"
}
```

## 4. Launch Electron with Dev Config Data Dir

Point Electron at the same data dir the CLI used.

```bash
DATA_DIR="$WORK_DIR/.toduai/data"
~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path "$PROJECT_ROOT/packages/electron/dist/main/index.js" \
  --env "TODUAI_DATA_DIR=$DATA_DIR"
```

## 5. Verify Electron Loaded CLI Data

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Both tasks visible: "Setup build" and "Write tests" under project "Dev App".

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Dev App" project shown with task count = 2.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "bug" label shown with red color.

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-config-dev-workflow.png
```

## 6. Create Data in Electron, Verify via CLI

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Project"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "#project-name"
NODE_PATH=$NODE_PATH node $INTERACT type "Electron Project"
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
```

```bash
toduai --config "$CONFIG" project list --no-color
```

**Expected:** Both "Dev App" and "Electron Project" shown.

## 7. TODUAI_DATA_DIR Overrides Config File

Verify that TODUAI_DATA_DIR takes precedence over config file's data_dir.

```bash
OVERRIDE_DIR=$(mktemp -d)
TODUAI_DATA_DIR="$OVERRIDE_DIR" toduai --config "$CONFIG" config show | grep "Data dir" -A1
```

**Expected:**

```
Data dir:     /tmp/tmpXXXXXX
              (TODUAI_DATA_DIR env var)
```

The env var overrides the config file's `data_dir: ./data`.

```bash
rm -rf "$OVERRIDE_DIR"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
cd -
rm -rf "$WORK_DIR"
```
