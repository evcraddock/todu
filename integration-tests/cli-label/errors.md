# Test: Label Error Cases

## Setup

```bash
export TODU_DATA_DIR=$(mktemp -d)
```

## Duplicate Name

```bash
todu-new label create --name bug
todu-new label create --name bug
```

**Expected:**

```
Error: name: Label "bug" already exists
```

Exit code: 1

## Invalid Color (Not Hex)

```bash
todu-new label create --name test --color "red"
```

**Expected:**

```
Error: color: Invalid hex color: red (expected #RRGGBB)
```

## Invalid Color (Wrong Format)

```bash
todu-new label create --name test --color "#gg0000"
```

**Expected:**

```
Error: color: Invalid hex color: #gg0000 (expected #RRGGBB)
```

## Update Nonexistent Label

```bash
todu-new label update "nonexistent" --name "foo"
```

**Expected:**

```
Label not found: nonexistent
```

## Delete Nonexistent Label

```bash
todu-new label delete "nonexistent"
```

**Expected:**

```
Label not found: nonexistent
```

## Update to Duplicate Name

```bash
todu-new label create --name feature
todu-new label update feature --name bug
```

**Expected:**

```
Error: name: Label "bug" already exists
```

## Cleanup

```bash
rm -rf "$TODU_DATA_DIR"
```
