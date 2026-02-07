# Test: List Projects

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new project create --name "Alpha" --priority high
todu-new project create --name "Beta" --priority low
todu-new project create --name "Gamma" --priority medium
```

## List All

```bash
todu-new project list --no-color
```

**Expected:**

```
ID             Name   Status  Priority
──────────────────────────────────────
proj-XXXXXXXX  Alpha  active  high    
proj-XXXXXXXX  Beta   active  low     
proj-XXXXXXXX  Gamma  active  medium  
```

## List with Status Filter

```bash
todu-new project update "Alpha" --status done
todu-new project list --status active --no-color
```

**Expected:** Only Beta and Gamma shown (Alpha is done).

## List as JSON

```bash
todu-new --format json project list
```

**Expected:** JSON array of project objects.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
