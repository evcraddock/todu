# Test: Delete Label

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new label create --name bug --color "#ff0000"
```

## Delete by Name

```bash
todu-new label delete bug
```

**Expected:**

```
Deleted label: bug (lbl-XXXXXXXX)
```

## Verify Deleted

```bash
todu-new label list
```

**Expected:**

```
No results.
```

## Delete by ID

```bash
todu-new label create --name temp
LABEL_ID=$(todu-new --format json label list | jq -r '.[0].id')
todu-new label delete "$LABEL_ID"
```

**Expected:**

```
Deleted label: temp (lbl-XXXXXXXX)
```

## Delete Cascades from Tasks

When a label is deleted, it's removed from any tasks that reference it.

```bash
todu-new label create --name feature --color "#00ff00"
todu-new project create --name "App"
TASK=$(todu-new --format json task create --title "Test" --project "App" --label feature)
TASK_ID=$(echo "$TASK" | jq -r .id)

# Verify label is on the task
todu-new task show "$TASK_ID"
# Should show Labels: feature

# Delete the label
todu-new label delete feature

# Verify label is removed from the task
todu-new task show "$TASK_ID"
# Should show Labels: (none)
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
