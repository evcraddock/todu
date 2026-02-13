# Test: Project Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODU_DATA_DIR=$TODU_DATA_DIR"
```

## 1. Create Without Name (CLI)

```bash
toduai project create
```

**Expected:** Error about missing required `--name` option. Exit code: 1.

## 2. Show Nonexistent Project (CLI)

```bash
toduai project show "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
```

Exit code: 1.

## 3. Update Nonexistent Project (CLI)

```bash
toduai project update "Nonexistent" --name "Foo"
```

**Expected:**

```
Project not found: Nonexistent
```

## 4. Delete Nonexistent Project (CLI)

```bash
toduai project delete "Nonexistent"
```

**Expected:**

```
Project not found: Nonexistent
```

## 5. Electron Empty State

With no projects created, verify the Electron app shows an empty state.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
sleep 2
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".content-area"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-errors-empty.png
```

**Expected:** Electron shows "No projects yet" empty state message.

## 6. Electron Create with Empty Name

Open the create dialog and try to submit without a name.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Project"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-errors-dialog.png
```

**Expected:** The "Create" button should be disabled when the name field is empty.

## 7. Electron Multi-Field Typing

Test that typing flows correctly across all form fields.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#proj-name"
NODE_PATH=$NODE_PATH node $INTERACT type "Error Test Project"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#proj-name').value"
```

**Expected:** Returns `"Error Test Project"`.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#proj-desc"
NODE_PATH=$NODE_PATH node $INTERACT type "A longer description to verify no focus stealing"
sleep 1
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#proj-desc').value"
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('#proj-name').value"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-project-errors-typing.png
```

**Expected:**
- Description returns `"A longer description to verify no focus stealing"`
- Name still returns `"Error Test Project"` (unchanged)
- Screenshot confirms both fields have their correct values

If the name field contains extra characters or the description is truncated, this confirms the focus-stealing bug (#1762).

```bash
NODE_PATH=$NODE_PATH node $INTERACT press "Escape"
```

**Expected:** Dialog closes.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODU_DATA_DIR"
```
