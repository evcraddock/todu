# Test: List Projects

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai project create --name "Alpha" --priority high
toduai project create --name "Beta" --priority low
toduai project create --name "Gamma" --priority medium
```

## List All

```bash
toduai project list --no-color
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
toduai project update "Alpha" --status done
toduai project list --status active --no-color
```

**Expected:** Only Beta and Gamma shown (Alpha is done).

## List as JSON

```bash
toduai --format json project list
```

**Expected:** JSON array of project objects.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
