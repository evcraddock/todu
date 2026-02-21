# Test: Label Error Cases

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"
```

## 1. Duplicate Name (CLI)

```bash
toduai label create --name bug
toduai label create --name bug
```

**Expected:**

```
Error: name: Label "bug" already exists
```

Exit code: 1

## 2. Invalid Color — Not Hex (CLI)

```bash
toduai label create --name test --color "red"
```

**Expected:**

```
Error: color: Invalid hex color: red (expected #RRGGBB)
```

## 3. Invalid Color — Wrong Format (CLI)

```bash
toduai label create --name test --color "#gg0000"
```

**Expected:**

```
Error: color: Invalid hex color: #gg0000 (expected #RRGGBB)
```

## 4. Update Nonexistent Label (CLI)

```bash
toduai label update "nonexistent" --name "foo"
```

**Expected:** `Label not found: nonexistent`

## 5. Delete Nonexistent Label (CLI)

```bash
toduai label delete "nonexistent"
```

**Expected:** `Label not found: nonexistent`

## 6. Update to Duplicate Name (CLI)

```bash
toduai label create --name feature
toduai label update feature --name bug
```

**Expected:**

```
Error: name: Label "bug" already exists
```

## 7. Electron Create — Empty Name Validation

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".data-table" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Label"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000

# Try to create without entering a name
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-errors-empty.png
```

**Expected:** Error message "Name is required" shown in dialog. Dialog stays open.

## 8. Electron Create — Invalid Color Hex

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "#label-name"
NODE_PATH=$NODE_PATH node $INTERACT type "test-label"
NODE_PATH=$NODE_PATH node $INTERACT click ".color-hex-input"
NODE_PATH=$NODE_PATH node $INTERACT type "notahex"
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-primary"
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".dialog"
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-label-errors-hex.png
```

**Expected:** Error "Invalid color format. Use #RRGGBB." shown in dialog.

> **Note:** The `ref={(el) => el?.focus()}` bug (#1762) exists on the name input. Since the
> color hex input is a separate component (not in dialog form fields with autoFocus), typing
> in the hex input may be affected if focus keeps returning to name. Check screenshot to verify.

```bash
# Close dialog
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

## 9. Electron Create Button Disabled Without Name

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=+ New Label"
NODE_PATH=$NODE_PATH node $INTERACT wait ".dialog" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.dialog-actions .btn-primary').disabled"
```

**Expected:** Returns `true` — Create button is disabled when name is empty.

```bash
NODE_PATH=$NODE_PATH node $INTERACT click ".dialog-actions .btn-secondary"
```

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
