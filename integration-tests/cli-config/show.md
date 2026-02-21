# Test: Config Show

## 1. Default Config — No File

```bash
toduai config show
```

**Expected:**

```
Config file:  /home/<user>/.config/toduai/config.yaml
              (default, not found)
Data dir:     /home/<user>/.config/toduai/data
              (default)
```

## 2. With --config Flag

```bash
WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"
toduai config init
toduai --config .toduai/config.yaml config show
```

**Expected:**

```
Config file:  /path/to/.toduai/config.yaml
              (--config flag)
Data dir:     /path/to/.toduai/data
              (config file (/path/to/.toduai/config.yaml))
```

## 3. With TODUAI_DATA_DIR Override

```bash
TODUAI_DATA_DIR=/tmp/override-data toduai config show
```

**Expected:**

```
Config file:  /home/<user>/.config/toduai/config.yaml
              (default, not found)
Data dir:     /tmp/override-data
              (TODUAI_DATA_DIR env var)
```

## 4. JSON Output

```bash
toduai --format json config show
```

**Expected:** JSON object with configPath, configSource, configExists, dataDir, dataDirSource fields.

## Teardown

```bash
cd -
rm -rf "$WORK_DIR"
```
