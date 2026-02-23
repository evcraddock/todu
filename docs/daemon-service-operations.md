# Daemon Service Operations (Linux + macOS)

This is the recommended way to run `toduai-daemon` continuously.

`to duai` CLI commands are daemon-backed, so running the daemon as a user service avoids manual restarts after reboot/login.

## Recommendation

- **Linux:** use `systemd --user`
- **macOS:** use `launchd` (`LaunchAgents`)

After setup, verify with:

```bash
toduai daemon status
toduai --format json daemon status
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
