# Test: Update Label

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
toduai label create --name bug --color "#ff0000"
```

## Update Name

```bash
toduai label update bug --name defect
```

**Expected:**

```
Label updated:
ID:      lbl-XXXXXXXX
Name:    defect
Color:   #ff0000
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
```

## Update Color

```bash
toduai label update defect --color "#cc0000"
```

**Expected:**

```
Label updated:
ID:      lbl-XXXXXXXX
Name:    defect
Color:   #cc0000
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
```

## Update Both

```bash
toduai label update defect --name critical --color "#990000"
```

**Expected:** Both name and color updated.

## Update by ID

```bash
LABEL_ID=$(toduai --format json label list | jq -r '.[0].id')
toduai label update "$LABEL_ID" --name urgent
```

**Expected:** Name changed to "urgent".

## Verify

```bash
toduai label list --no-color
```

**Expected:** Shows the label with final name and color.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
