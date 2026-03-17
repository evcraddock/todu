# Test: Move Task

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

todu project create --name "Source"
todu project create --name "Destination"
TASK=$(todu --format json task create --title "Movable task" --project "Source")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## 1. Move to Another Project (CLI)

```bash
todu task move "$TASK_ID" "Destination"
```

**Expected:**

```
Moved task to Destination:
ID:          task-XXXXXXXX
Title:       Movable task
...
Project:     Destination
...
```

## 2. Verify Source is Empty (CLI)

```bash
todu --format json task list --project "Source"
```

**Expected:** Empty array `[]`.

## 3. Verify Task is in Destination (CLI)

```bash
todu --format json task list --project "Destination"
```

**Expected:** Array with one task.

## 4. Verify Electron Reflects Move

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** "Movable task" shows project = "Destination".

## 5. Move Task via Electron Project Dropdown

Click into task detail and change the project dropdown.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Movable task"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-task-move-detail.png
```

**Expected:** Detail view shows Project dropdown set to "Destination".

```bash
# Change project back to Source via the dropdown
# Find the project dropdown (after priority dropdown)
NODE_PATH=$NODE_PATH node $INTERACT eval "
  const selects = document.querySelectorAll('.inline-select');
  // Find the one with project options
  for (const s of selects) {
    const opts = Array.from(s.options).map(o => o.text);
    if (opts.includes('Source')) return { index: Array.from(selects).indexOf(s), current: s.value, options: opts };
  }
"
```

**Expected:** Shows which select has project options and current value.

```bash
# Select "Source" from the project dropdown (use native setter for React controlled select)
NODE_PATH=$NODE_PATH node $INTERACT eval "
  const selects = document.querySelectorAll('.inline-select');
  for (const s of selects) {
    const opts = Array.from(s.options).map(o => o.text);
    if (opts.includes('Source')) {
      const sourceOpt = Array.from(s.options).find(o => o.text === 'Source');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(s, sourceOpt.value);
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return 'moved to Source';
    }
  }
"
```

**Expected:** Returns "moved to Source".

```bash
# Verify CLI sees the move
todu task show "$TASK_ID" --no-color | grep "Project"
```

**Expected:** `Project: Source`

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
