# Daemon Service Operations (Linux + macOS)

This is the recommended way to run `toduai-daemon` continuously.

`toduai` CLI commands are daemon-backed, so running the daemon as a user service avoids manual restarts after reboot/login.

## Recommendation

- **Linux:** use `systemd --user`
- **macOS:** use `launchd` (`LaunchAgents`)

After setup, verify with:

```bash
toduai daemon status
toduai --format json daemon status
```

## CLI lifecycle wrappers (`daemon start|stop|restart`)

`toduai daemon start`, `toduai daemon stop`, and `toduai daemon restart` follow this deterministic order:

1. If `TODUAI_DAEMON_LIFECYCLE_MODE` is set to one of
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
- stops only managed direct-mode daemon processes
- refuses to stop unmanaged daemon processes (safe fallback behavior)

To force a specific behavior (for scripting/testing):

```bash
export TODUAI_DAEMON_LIFECYCLE_MODE=direct # or systemd-user / launchd / auto
```

Daemon logging level is controlled with `TODUAI_LOG_LEVEL`:

```bash
export TODUAI_LOG_LEVEL=debug  # error | warn | info | debug
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
Environment=TODUAI_DATA_DIR=%h/.local/share/todu
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
      <key>TODUAI_DATA_DIR</key>
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
export TODUAI_DAEMON_ASSIGNED_WORKERS="recurring,github-sync"
```

- Sync plugin module paths can be defined in config file under `daemon.plugins.paths`.
- Sync plugin module path env override (comma-separated module paths):

```bash
export TODUAI_DAEMON_PLUGIN_PATHS="/opt/todu/plugins/github/index.js,/opt/todu/plugins/forgejo/index.js"
```

- Plugin path resolution order is env first, then config file.
- Config file plugin paths resolve relative to the config file directory.
- Plugin path/config changes apply on daemon restart.
- Plugins can export `workerPlugin` (generic worker plugin) or `syncProvider` (sync provider plugin).
- Sync plugin scheduler config can be overridden via `TODUAI_DAEMON_PLUGIN_CONFIG` (JSON object keyed by plugin name).

```bash
export TODUAI_DAEMON_PLUGIN_CONFIG='{"github":{"projectId":"proj-123","intervalSeconds":300,"retryInitialSeconds":5,"retryMaxSeconds":60}}'
```

- Optional socket override:

```bash
export TODUAI_DAEMON_SOCKET=/custom/path/daemon.sock
```

If you set a socket override for the daemon service, CLI invocations must use the same override.

## Troubleshooting

### CLI says daemon unavailable

- Confirm service status (`systemctl --user status ...` or `launchctl print ...`).
- Confirm `TODUAI_DATA_DIR` is what you expect.
- Confirm socket path matches CLI expectations.

### Daemon starts but CLI still fails

- Run `toduai --format json daemon status` and inspect `reason`/`transport.path`.
- Check service logs (`journalctl --user -u toduai-daemon -f` or `tail -f` macOS logs).
