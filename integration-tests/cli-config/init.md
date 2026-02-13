# Test: Config Init

## Setup

```bash
WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"
```

## 1. Initialize Dev Config

```bash
toduai config init
```

**Expected:**

```
Created: /path/to/.todu/config.yaml
Created: /path/to/.todu/.gitignore

Usage:
  toduai --config /path/to/.todu/config.yaml task list
```

## 2. Verify Files Created

```bash
cat .todu/config.yaml
```

**Expected:**

```yaml
data_dir: ./data
```

```bash
cat .todu/.gitignore
```

**Expected:**

```
# Ignore todu data
data/
```

## 3. Init is Idempotent

```bash
toduai config init
```

**Expected:**

```
Config already exists: /path/to/.todu/config.yaml
```

Exit code: 0 (not an error).

## Teardown

```bash
cd -
rm -rf "$WORK_DIR"
```
