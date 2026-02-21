# Test: App Startup

Verify the Electron app launches cleanly with no errors.

## Setup

```bash
export TODUAI_DATA_DIR=$(mktemp -d)
export NODE_PATH=$(find ~/.npm/_npx -path "*/node_modules/playwright" -type d 2>/dev/null | head -1 | xargs dirname)
export INTERACT=~/.pi/agent/skills/electron-testing/scripts/interact.js

~/.pi/agent/skills/electron-testing/scripts/launch.sh \
  --app-path ./packages/electron/dist/main/index.js \
  --env "TODUAI_DATA_DIR=$TODUAI_DATA_DIR"
```

## 1. Verify App Loaded

```bash
NODE_PATH=$NODE_PATH node $INTERACT wait ".content-area" --timeout 10000
NODE_PATH=$NODE_PATH node $INTERACT screenshot --output /tmp/test-lifecycle-startup.png
```

**Expected:** App loads and shows main content area.

## 2. Check for Console Errors

```bash
NODE_PATH=$NODE_PATH node $INTERACT console
```

**Expected:** No error-level messages. Warnings may exist but no `error` entries.
If errors found, document them.

## 3. Verify Page Title

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "document.title"
```

**Expected:** Returns the app title (e.g. `"todu"`).

## 4. Verify Sidebar Exists

```bash
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".sidebar"
```

**Expected:** Shows navigation items: Tasks, Projects, Habits, Recurring, Notes, Labels, Agent.

## 5. Verify Default View

```bash
NODE_PATH=$NODE_PATH node $INTERACT text --selector ".view-title"
```

**Expected:** Shows a view title (the default landing view).

## 6. Verify Status Indicator

```bash
NODE_PATH=$NODE_PATH node $INTERACT eval "document.querySelector('.status-indicator')?.textContent"
```

**Expected:** Returns `"● Local"` or similar connection status.

## Teardown

```bash
~/.pi/agent/skills/electron-testing/scripts/stop.sh
rm -rf "$TODUAI_DATA_DIR"
```
