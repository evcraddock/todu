# Test: Delete Project

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "Delete Me"
```

## Delete by Name

```bash
toduai project delete "Delete Me"
```

**Expected:**

```
Deleted project: Delete Me (proj-XXXXXXXX)
```

## Verify Deleted

```bash
toduai project list
```

**Expected:**

```
No results.
```

## Delete by ID

```bash
toduai project create --name "Also Delete"
PROJECT_ID=$(toduai --format json project list | jq -r '.[0].id')
toduai project delete "$PROJECT_ID"
```

**Expected:**

```
Deleted project: Also Delete (proj-XXXXXXXX)
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
