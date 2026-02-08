# Test: Create Label

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Create with Name Only

```bash
toduai label create --name bug
```

**Expected:**

```
Label created:
ID:      lbl-XXXXXXXX
Name:    bug
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
```

## Create with Color

```bash
toduai label create --name urgent --color "#ff0000"
```

**Expected:**

```
Label created:
ID:      lbl-XXXXXXXX
Name:    urgent
Color:   #ff0000
Created: YYYY-MM-DDTHH:MM:SS.MMMZ
```

## Create with JSON Output

```bash
toduai --format json label create --name feature --color "#00ff00"
```

**Expected:**

```json
{
  "id": "lbl-XXXXXXXX",
  "name": "feature",
  "color": "#00ff00",
  "createdAt": "YYYY-MM-DDTHH:MM:SS.MMMZ"
}
```

## Verify

```bash
toduai label list
```

**Expected:** All three labels shown.

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
