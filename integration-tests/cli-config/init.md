# Test: Config Init

## Setup

```bash
cd $(mktemp -d)
```

## Initialize Dev Config

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

## Verify Files Created

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

## Init is Idempotent

```bash
toduai config init
```

**Expected:**

```
Config already exists: /path/to/.todu/config.yaml
```

## Cleanup

```bash
cd - && rm -rf /tmp/tmp.*
```
