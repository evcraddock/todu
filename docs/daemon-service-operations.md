# Daemon Service Operations (Linux + macOS)

This is the recommended way to run `toduai-daemon` continuously.

`todu` CLI commands are daemon-backed, so running the daemon as a user service avoids manual restarts after reboot/login.

## Recommendation

- **Linux:** use `systemd --user`
- **macOS:** use `launchd` (`LaunchAgents`)

After setup, verify with:

```bash
todu daemon status
todu --format json daemon status
```

## Config/data migration defaults

- Default home config path is now `~/.config/todu/config.yaml`.
- Existing `~/.config/toduai` state is migrated automatically to `~/.config/todu` when the new default path is absent.
- Absolute legacy config values under `~/.config/toduai/...` are normalized to `todu` paths when config is loaded.
- `TODU_*` env vars are primary; legacy `TODUAI_*` env vars remain supported temporarily as fallback.

## CLI lifecycle wrappers (`daemon start|stop|restart`)

`todu daemon start`, `todu daemon stop`, and `todu daemon restart` follow this deterministic order:

1. If `TODU_DAEMON_LIFECYCLE_MODE` is set to one of
   - `systemd-user`
   - `launchd`
   - `direct`
   it uses that mode.
2. Otherwise (`auto`, default), CLI prefers service-manager delegation when registration exists:
   - Linux: `~/.config/systemd/user/toduai-daemon.service`
   - macOS: `~/Library/LaunchAgents/com.todu.daemon.plist`
3. If no service registration is detected, CLI uses direct managed fallback mode.

Direct managed fallback mode:

- starts daemon as a detached local process
- writes managed PID to `<data_dir>/daemon.pid`
- appends stdout logs to `<data_dir>/daemon.out.log`
- appends stderr logs to `<data_dir>/daemon.err.log`
- rotates oversized direct log files on `start`/`restart`, keeping `.1` and `.2` archives
- stops only managed direct-mode daemon processes
- refuses to stop unmanaged daemon processes (safe fallback behavior)

To force a specific behavior (for scripting/testing):

```bash
export TODU_DAEMON_LIFECYCLE_MODE=direct # or systemd-user / launchd / auto
```

Legacy fallback: `TODUAI_DAEMON_LIFECYCLE_MODE`.

Daemon logging level is controlled with `TODU_LOG_LEVEL`:

```bash
export TODU_LOG_LEVEL=debug  # error | warn | info | debug
```

---

## Linux (`systemd --user`)

### 1) Create user unit

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/toduai-daemon.service <<'EOF'
[Unit]
Description=toduai daemon
After=network.target

[Service]
Type=simple
Environment=TODU_DATA_DIR=%h/.local/share/todu
ExecStart=/usr/bin/env toduai-daemon
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
EOF
```

### 2) Enable + start

```bash
systemctl --user daemon-reload
systemctl --user enable --now toduai-daemon
```

### 3) Operate service

```bash
systemctl --user status toduai-daemon
systemctl --user restart toduai-daemon
systemctl --user stop toduai-daemon
systemctl --user start toduai-daemon
journalctl --user -u toduai-daemon -f
```

### 4) Optional: keep running after logout

```bash
loginctl enable-linger "$USER"
```

---

## macOS (`launchd`)

### 1) Create LaunchAgent plist

```bash
mkdir -p ~/Library/LaunchAgents
DAEMON_BIN="$(command -v toduai-daemon)"
cat > ~/Library/LaunchAgents/com.todu.daemon.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.todu.daemon</string>

    <key>ProgramArguments</key>
    <array>
      <string>${DAEMON_BIN}</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>TODU_DATA_DIR</key>
      <string>${HOME}/.local/share/todu</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${HOME}/Library/Logs/toduai-daemon.out.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/toduai-daemon.err.log</string>
  </dict>
</plist>
EOF
```

### 2) Load + start

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.todu.daemon.plist
launchctl kickstart -k gui/$(id -u)/com.todu.daemon
```

### 3) Operate service

```bash
launchctl print gui/$(id -u)/com.todu.daemon
launchctl kickstart -k gui/$(id -u)/com.todu.daemon
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.todu.daemon.plist
tail -f ~/Library/Logs/toduai-daemon.out.log ~/Library/Logs/toduai-daemon.err.log
```

---

## Environment and socket notes

- Default data dir is config-resolved; examples use `~/.local/share/todu` for clarity.
- Default daemon socket path is `<data_dir>/daemon.sock`.
- Worker assignment env override (comma-separated worker types):

```bash
export TODU_DAEMON_ASSIGNED_WORKERS="recurring,github-sync"
```

Legacy fallback: `TODUAI_DAEMON_ASSIGNED_WORKERS`.

- Sync plugin module paths can be defined in config file under `daemon.plugins.paths`.
- Sync plugin module path env override (comma-separated module paths):

```bash
export TODU_DAEMON_PLUGIN_PATHS="/opt/todu/plugins/github/index.js,/opt/todu/plugins/forgejo/index.js"
```

Legacy fallback: `TODUAI_DAEMON_PLUGIN_PATHS`.

- Plugin path resolution order is env first, then config file.
- Config file plugin paths resolve relative to the config file directory.
- Plugin path/config changes apply on daemon restart.
- Plugins can export `workerPlugin` (generic worker plugin) or `syncProvider` (sync provider plugin).
- Sync plugin scheduler config can be overridden via `TODU_DAEMON_PLUGIN_CONFIG` (JSON object keyed by plugin name).

```bash
export TODU_DAEMON_PLUGIN_CONFIG='{"github":{"intervalSeconds":300,"retryInitialSeconds":5,"retryMaxSeconds":60,"settings":{"token":"env:GITHUB_TOKEN"}}}'
```

Legacy fallback: `TODUAI_DAEMON_PLUGIN_CONFIG`.

- Optional socket override:

```bash
export TODU_DAEMON_SOCKET=/custom/path/daemon.sock
```

Legacy fallback: `TODUAI_DAEMON_SOCKET`.

If you set a socket override for the daemon service, CLI invocations must use the same override.

## Troubleshooting

### CLI says daemon unavailable

- Confirm service status (`systemctl --user status ...` or `launchctl print ...`).
- Confirm `TODU_DATA_DIR` is what you expect.
- Legacy fallback is `TODUAI_DATA_DIR`.
- Confirm socket path matches CLI expectations.

### Daemon starts but CLI still fails

- Run `todu --format json daemon status` and inspect `reason`/`transport.path`.
- Check service logs (`journalctl --user -u toduai-daemon -f` or `tail -f` macOS logs).
- In direct lifecycle mode, inspect `<data_dir>/daemon.out.log` and `<data_dir>/daemon.err.log`.
