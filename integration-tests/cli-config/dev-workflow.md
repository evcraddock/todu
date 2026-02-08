# Test: Dev Config Workflow

End-to-end workflow for using a dev config in a project.

## Setup

```bash
cd $(mktemp -d)
toduai config init
```

## Use Dev Config for All Commands

```bash
CONFIG=".todu/config.yaml"

# Create project
toduai --config $CONFIG project create --name "Dev App"

# Create tasks
toduai --config $CONFIG task create --title "Setup build" --project "Dev App"
toduai --config $CONFIG task create --title "Write tests" --project "Dev App"

# List tasks
toduai --config $CONFIG task list --no-color
```

**Expected:** Both tasks shown in table format.

## Verify Data Isolation

```bash
# Dev data should be in .todu/data/
ls .todu/data/todu-catalog.id

# Default location should NOT have this data
# (unless you already use toduai there)
```

**Expected:** `todu-catalog.id` exists in `.todu/data/`.

## JSON Config Show

```bash
toduai --config $CONFIG --format json config show
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
