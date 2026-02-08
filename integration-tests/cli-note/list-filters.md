# Test: List Notes with Filters

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "App"
toduai project create --name "Infra"
TASK=$(toduai --format json task create --title "Fix bug" --project "App")
TASK_ID=$(echo "$TASK" | jq -r .id)

# Create varied notes
toduai note add "Journal entry" --tag daily
toduai note add "Task progress" --task "$TASK_ID" --tag update
toduai note add "Project decision" --project "App" --tag decision
toduai note add "Agent review" --author agent --tag review
toduai note add "Infra note" --project "Infra"
```

## List All

```bash
toduai note list --no-color
```

**Expected:** All 5 notes shown.

## Filter by Task

```bash
toduai note list --task "$TASK_ID" --no-color
```

**Expected:** Only "Task progress".

## Filter by Project

```bash
toduai note list --project "App" --no-color
```

**Expected:** Only "Project decision".

## Filter by Tag

```bash
toduai note list --tag daily --no-color
```

**Expected:** Only "Journal entry".

## Filter by Author

```bash
toduai note list --author agent --no-color
```

**Expected:** Only "Agent review".

## List as JSON

```bash
toduai --format json note list
```

**Expected:** JSON array of all note objects.

## Empty Results

```bash
toduai note list --tag nonexistent --no-color
```

**Expected:**

```
No results.
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
