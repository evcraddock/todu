# Test: Empty States

Verify all views display correct empty states when no data exists.

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"
```

## 1. Tasks Empty State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Tasks"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.empty-state')?.textContent"
```

**Expected:** `"No tasks match your filters"`

## 2. Projects Empty State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Projects"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.empty-state')?.textContent"
```

**Expected:** `"No projects yet"`

## 3. Habits Empty State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Habits"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.empty-state')?.textContent"
```

**Expected:** `"No habits yet"`

## 4. Recurring Empty State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Recurring"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.empty-state')?.textContent"
```

**Expected:** `"No recurring templates"`

## 5. Notes Empty State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Notes"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.empty-state')?.textContent"
```

**Expected:** `"No notes found"`

## 6. Labels Empty State

```bash
NODE_PATH=$NODE_PATH node $INTERACT click "text=Labels"
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.empty-state')?.textContent"
```

**Expected:** `"No labels yet"`

## 7. All Empty States Have Create Buttons

Each view should still show its "+" create button even when empty.

```bash
for view in Tasks Projects Habits Recurring Notes Labels; do
  NODE_PATH=$NODE_PATH node $INTERACT click "text=$view"
  NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 5000
  NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.btn-primary') !== null"
done
```

**Expected:** All return `true` — create button exists on every empty view.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
