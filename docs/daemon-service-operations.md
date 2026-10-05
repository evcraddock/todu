# Daemon Service Operations (Linux + macOS)

This is the recommended way to run the local todu daemon continuously.

`todu` CLI commands are daemon-backed, so running the daemon as a user service avoids manual restarts after reboot/login.

## Recommendation

- **Linux:** use `systemd --user`
- **macOS:** use `launchd` (`LaunchAgents`)

After setup, verify with:

```bash
todu daemon status
todu --format json daemon status
```

## Config/data defaults

- Default home config path is `~/.config/todu/config.yaml`.
- `TODU_*` env vars are the only supported environment overrides.
- The daemon binary/service name is `todu-daemon`.

### Bootstrap owner actor config

To override the default migrated owner actor (`actor-user` / `user`), set this in `~/.config/todu/config.yaml` **before the first daemon startup that creates or migrates the dataset**:

```yaml
identity:
  ownerActor:
    id: erik
    displayName: Erik
```

After the dataset is already migrated, changing this config later does not rewrite existing actor IDs.

## CLI lifecycle wrappers (`daemon start|stop|restart`)

`todu daemon start`, `todu daemon stop`, and `todu daemon restart` follow this deterministic order:

1. If `TODU_DAEMON_LIFECYCLE_MODE` is set to one of
   - `systemd-user`
   - `launchd`
   - `direct`
   it uses that mode.
2. Otherwise (`auto`, default), CLI prefers service-manager delegation when registration exists:
   - Linux: `~/.config/systemd/user/todu-daemon.service`
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

### Shutdown feedback and persistence

In interactive terminals, `todu daemon stop` and `todu daemon restart` show animated dots while the command waits, then clear the indicator before printing the final result. The animation indicates activity, not a percentage or proof that disk writes are advancing. JSON output, redirected output, and `TERM=dumb` never contain animation. Commands invoked directly through `systemctl` or `launchctl` do not show Todu's indicator.

Engine-managed persistent storage shutdown flushes ready documents and drains tracked filesystem saves/deletes, allowing Automerge's throttled successors to settle before reporting completion. Local storage shutdown has a five-second deadline; actual storage errors or expiry are failures, not confirmation that writes finished. A timeout does not cancel outstanding filesystem work. Caller-supplied repositories retain responsibility for their adapters' pending writes; the engine allows a throttle-settling window but cannot track an external adapter.

Direct-mode stop allows ten seconds for graceful process exit before the existing forced-termination fallback. Forced termination returns an error because local storage completion is unconfirmed, and restart does not launch a replacement after that failure. Service-manager subprocesses run asynchronously with a thirty-second command timeout so the indicator remains responsive. Inspect daemon logs for engine shutdown errors; process exit or successful service-manager delegation alone does not certify storage success or remote replication.

Daemon logging level is controlled with `TODU_LOG_LEVEL`:

```bash
export TODU_LOG_LEVEL=debug  # error | warn | info | debug
```

---

## Linux (`systemd --user`)

### 1) Create user unit

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/todu-daemon.service <<'EOF'
[Unit]
Description=todu daemon
After=network.target

[Service]
Type=simple
Environment=TODU_DATA_DIR=%h/.local/share/todu
ExecStart=/usr/bin/env todu-daemon
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
EOF
```

### 2) Enable + start

```bash
systemctl --user daemon-reload
systemctl --user enable --now todu-daemon
```

### 3) Operate service

```bash
systemctl --user status todu-daemon
systemctl --user restart todu-daemon
systemctl --user stop todu-daemon
systemctl --user start todu-daemon
journalctl --user -u todu-daemon -f
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
DAEMON_BIN="$(command -v todu-daemon)"
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
    <string>${HOME}/Library/Logs/todu-daemon.out.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/todu-daemon.err.log</string>
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
tail -f ~/Library/Logs/todu-daemon.out.log ~/Library/Logs/todu-daemon.err.log
```

---

## Environment and socket notes

- Default data dir is config-resolved; examples use `~/.local/share/todu` for clarity.
- Default daemon socket path is `<data_dir>/daemon.sock`.
- Worker assignment env override (comma-separated worker types):

```bash
export TODU_DAEMON_ASSIGNED_WORKERS="recurring,github-sync"
```

- Worker plugin module paths or npm package specifiers can be defined in the config file under `daemon.plugins.paths`.
- Sync plugin module path env override (comma-separated module paths):

```bash
export TODU_DAEMON_PLUGIN_PATHS="/opt/todu/plugins/github/index.js,/opt/todu/plugins/forgejo/index.js"
```

- Plugin path resolution order is env first, then config file.
- Config entries that are absolute or start with `.` are filesystem paths; dot-relative paths resolve from the config file directory. Other entries are npm package specifiers.
- Plugin path/config changes apply on daemon restart.
- Plugins can export `workerPlugin` (generic worker plugin) or `syncProvider` (sync provider plugin).
- See [Recurring Worker Installation](recurring-worker-installation.md) for npm installation, assignment, activation, and verification of recurring automation.
- Sync plugin scheduler config can be overridden via `TODU_DAEMON_PLUGIN_CONFIG` (JSON object keyed by plugin name).

```bash
export TODU_DAEMON_PLUGIN_CONFIG='{"github":{"intervalSeconds":300,"retryInitialSeconds":5,"retryMaxSeconds":60,"settings":{"token":"env:GITHUB_TOKEN"}}}'
```

- Optional socket override:

```bash
export TODU_DAEMON_SOCKET=/custom/path/daemon.sock
```

If you set a socket override for the daemon service, CLI invocations must use the same override.

## Troubleshooting

### CLI says daemon unavailable

- Confirm service status (`systemctl --user status ...` or `launchctl print ...`).
- Confirm `TODU_DATA_DIR` is what you expect.
- Confirm socket path matches CLI expectations.

### Daemon starts but CLI still fails

- Run `todu --format json daemon status` and inspect `reason`/`transport.path`.
- Check service logs (`journalctl --user -u todu-daemon -f` or `tail -f` macOS logs).
- In direct lifecycle mode, inspect `<data_dir>/daemon.out.log` and `<data_dir>/daemon.err.log`.
