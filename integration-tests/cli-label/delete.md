# Test: Delete Label

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai label create --name bug --color "#ff0000"
```

## Delete by Name

```bash
toduai label delete bug
```

**Expected:**

```
Deleted label: bug (lbl-XXXXXXXX)
```

## Verify Deleted

```bash
toduai label list
```

**Expected:**

```
No results.
```

## Delete by ID

```bash
toduai label create --name temp
LABEL_ID=$(toduai --format json label list | jq -r '.[0].id')
toduai label delete "$LABEL_ID"
```

**Expected:**

```
Deleted label: temp (lbl-XXXXXXXX)
```

## Delete Cascades from Tasks

When a label is deleted, it's removed from any tasks that reference it.

```bash
toduai label create --name feature --color "#00ff00"
toduai project create --name "App"
TASK=$(toduai --format json task create --title "Test" --project "App" --label feature)
TASK_ID=$(echo "$TASK" | jq -r .id)

# Verify label is on the task
toduai task show "$TASK_ID"
# Should show Labels: feature

# Delete the label
toduai label delete feature

# Verify label is removed from the task
toduai task show "$TASK_ID"
# Should show Labels: (none)
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
