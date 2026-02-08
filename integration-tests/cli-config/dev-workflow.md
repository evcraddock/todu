# Test: Dev Config Workflow

End-to-end workflow for using a dev config in a project.

## Setup

```bash
cd $(mktemp -d)
todu-new config init
```

## Use Dev Config for All Commands

```bash
CONFIG=".todu/config.yaml"

# Create project
todu-new --config $CONFIG project create --name "Dev App"

# Create tasks
todu-new --config $CONFIG task create --title "Setup build" --project "Dev App"
todu-new --config $CONFIG task create --title "Write tests" --project "Dev App"

# List tasks
todu-new --config $CONFIG task list --no-color
```

**Expected:** Both tasks shown in table format.

## Verify Data Isolation

```bash
# Dev data should be in .todu/data/
ls .todu/data/todu-catalog.id

# Default location should NOT have this data
# (unless you already use todu-new there)
```

**Expected:** `todu-catalog.id` exists in `.todu/data/`.

## JSON Config Show

```bash
todu-new --config $CONFIG --format json config show
```

**Expected:**

```json
{
  "configPath": "/path/to/.todu/config.yaml",
  "configSource": "--config flag",
  "configExists": true,
  "dataDir": "/path/to/.todu/data",
  "dataDirSource": "config file (/path/to/.todu/config.yaml)"
}
```

## Cleanup

```bash
cd - && rm -rf /tmp/tmp.*
```
