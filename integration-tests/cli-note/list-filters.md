# Test: List Notes with Filters

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "App"
todu-new project create --name "Infra"
TASK=$(todu-new --format json task create --title "Fix bug" --project "App")
TASK_ID=$(echo "$TASK" | jq -r .id)

# Create varied notes
todu-new note add "Journal entry" --tag daily
todu-new note add "Task progress" --task "$TASK_ID" --tag update
todu-new note add "Project decision" --project "App" --tag decision
todu-new note add "Agent review" --author agent --tag review
todu-new note add "Infra note" --project "Infra"
```

## List All

```bash
todu-new note list --no-color
```

**Expected:** All 5 notes shown.

## Filter by Task

```bash
todu-new note list --task "$TASK_ID" --no-color
```

**Expected:** Only "Task progress".

## Filter by Project

```bash
todu-new note list --project "App" --no-color
```

**Expected:** Only "Project decision".

## Filter by Tag

```bash
todu-new note list --tag daily --no-color
```

**Expected:** Only "Journal entry".

## Filter by Author

```bash
todu-new note list --author agent --no-color
```

**Expected:** Only "Agent review".

## List as JSON

```bash
todu-new --format json note list
```

**Expected:** JSON array of all note objects.

## Empty Results

```bash
todu-new note list --tag nonexistent --no-color
```

**Expected:**

```
No results.
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
