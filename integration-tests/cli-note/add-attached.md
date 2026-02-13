# Test: Add Attached Notes

Notes attached to tasks or projects.

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"

toduai project create --name "My App"
TASK=$(toduai --format json task create --title "Fix bug" --project "My App")
TASK_ID=$(echo "$TASK" | jq -r .id)
```

## 1. Note Attached to Task (CLI)

```bash
toduai note add "Found the root cause — null pointer in auth module" --task "$TASK_ID"
```

**Expected:**

```
Note added:
ID:      note-XXXXXXXX
Author:  user
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
Entity:  task:task-XXXXXXXX

Found the root cause — null pointer in auth module
```

## 2. Note Attached to Project by Name (CLI)

```bash
toduai note add "Architecture decision: use Automerge for sync" --project "My App"
```

**Expected:**

```
Note added:
ID:      note-XXXXXXXX
Author:  user
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
Entity:  project:proj-XXXXXXXX

Architecture decision: use Automerge for sync
```

## 3. Attached Note with Tags (CLI)

```bash
toduai note add "Blocked on API key" --task "$TASK_ID" --tag blocker
```

**Expected:** Shows entity and tags.

## 4. Verify Task Notes (CLI)

```bash
toduai note list --task "$TASK_ID" --no-color
```

**Expected:** Shows 2 notes attached to the task.

## 5. Verify Project Notes (CLI)

```bash
toduai note list --project "My App" --no-color
```

**Expected:** Shows 1 note attached to the project.

## 6. Verify Electron Shows Attached Notes

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Table shows all 3 notes:
- "Found the root cause..." with Attached To = "task: Fix bug"
- "Architecture decision..." with Attached To = "project: My App"
- "Blocked on API key" with Attached To = "task: Fix bug", Tags: blocker

```bash
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-note-attached-list.png
```

## 7. Verify Electron Entity Type Filter

```bash
# Filter to "Task comments" only
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'task');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only 2 task-attached notes shown.

```bash
# Filter to "Project comments"
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'project');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()
"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 3000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".data-table"
```

**Expected:** Only 1 project-attached note ("Architecture decision...").

```bash
# Reset filter
NODE_PATH=$NODE_PATH node $INTERACT eval "
  (() => {
    const sel = document.querySelectorAll('.filter-select')[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'all');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()
"
```

## 8. Verify Entity Link Navigation

Click the entity link to navigate to the attached task.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".entity-link >> nth=0"
NODE_PATH=$NODE_PATH node $INTERACT wait ".detail-title" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".detail-title"
```

**Expected:** Navigates to task detail view showing "Fix bug".

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
