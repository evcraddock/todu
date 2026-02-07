# Test: Delete Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "Delete Me"
```

## Delete by Name

```bash
todu-new project delete "Delete Me"
```

**Expected:**

```
Deleted project: Delete Me (proj-XXXXXXXX)
```

## Verify Deleted

```bash
todu-new project list
```

**Expected:**

```
No results.
```

## Delete by ID

```bash
todu-new project create --name "Also Delete"
PROJECT_ID=$(todu-new --format json project list | jq -r '.[0].id')
todu-new project delete "$PROJECT_ID"
```

**Expected:**

```
Deleted project: Also Delete (proj-XXXXXXXX)
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
