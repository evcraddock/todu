# Test: List Labels

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new label create --name bug --color "#ff0000"
todu-new label create --name feature --color "#00ff00"
todu-new label create --name docs
```

## List All

```bash
todu-new label list --no-color
```

**Expected:**

```
ID            Name     Color  
──────────────────────────────
lbl-XXXXXXXX  bug      #ff0000
lbl-XXXXXXXX  feature  #00ff00
lbl-XXXXXXXX  docs           
```

## List as JSON

```bash
todu-new --format json label list
```

**Expected:** JSON array of label objects.

## Empty List

```bash
export TODU_DATA_DIR=$(mktemp -d)
todu-new label list
```

**Expected:**

```
No results.
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
