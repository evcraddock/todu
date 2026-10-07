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

## Optional LAN listener

Listening is disabled unless the daemon's local config explicitly enables `sync.listener` with a literal IPv4/IPv6 `bind` address. The port defaults to `24377`; unavailable addresses and occupied ports produce listener errors without rebinding or disabling private local operations.

```bash
todu sync listener enable --bind 192.168.1.10
todu daemon restart
todu sync listener status
```

Ensure the CLI edits the file actually read by the service (`TODU_CONFIG` or the default home config). Configuration changes require an explicit restart. To remove exposure, run `todu sync listener disable` followed by restart, or stop the daemon; saving the disabled flag alone does not close a running listener. Existing `sync stop` affects only the configured outbound server.

The shared HTTP/WebSocket listener accepts native replication at `/sync/<current-catalog-id>` and exposes no remote administration. It is unencrypted and unauthenticated: restrict access to the trusted LAN, avoid unnecessary all-interface bindings, and do not forward it to the internet. Registry endpoints are metadata, not authorization. Server settings, dataset IDs, and worker/provider assignments are preserved. See [CLI listener controls](cli-daemon-usage.md#opt-in-lan-sync-listener) for configuration, status, and follow-up limitations.

## Pristine enrollment before service startup

For a new replica of an existing dataset, run `todu sync enrollment prepare` in the service's actual config/data context **before enabling the service or starting the desktop/daemon for the first time**. Then start the daemon and request enrollment with `todu sync enroll http://known-peer.lan:24377`. Inspect/approve the request locally on that listening peer. Pending startup keeps a native persistent identity but has no live catalog, configured-server document adapter, plugins, workers, or host processing. No throwaway catalog is created.

An already initialized empty installation is not pristine. Same-dataset replicas can enroll through their existing daemon; different datasets are refused unchanged. Do not change a service data directory or delete its storage merely to bypass refusal. Environment overrides such as `TODU_DATA_DIR` and `TODU_DAEMON_SOCKET` must match the service when preparing and issuing commands.

Pending requests and staged data survive restarts, and polling/attachment is stopped and drained before pending storage shutdown. Approval does not enable worker/plugin settings; existing same-dataset execution stays intact. Initial pristine attachment skips worker startup/host processing, while a later explicit normal restart honors existing local configuration. Source credentials/provider state are not copied. Cancellation does not undo durable source approval, remove existing membership, delete cached documents, or initialize a default dataset. See [enrollment commands and failure handling](cli-daemon-usage.md#locally-approved-device-enrollment).

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

The daemon stops accepting RPC work and closes its listener before draining admitted handlers. It waits for actual asynchronous handler completion, even when the response already timed out or the client disconnected; queued requests not yet admitted receive `DAEMON_UNAVAILABLE` if their connection is still writable. Persistent/idle clients do not need to disconnect themselves: the daemon ends their connections after the handler drain and destroys connections that remain open after a short, bounded socket-close grace period. Event subscriptions are removed, and storage is closed only after admitted work completes, using the final engine if an in-flight join switched catalogs. A timed-out response does not cancel its handler; a genuinely stuck handler can still exhaust the existing direct-stop allowance and must not be treated as successful storage shutdown.

Concurrent stops share shutdown, which keeps the process alive until it settles even when the remaining handler work has only promises or unreferenced timers. This is not a new deadline or cancellation mechanism. A failed shutdown is reported in logs and through the process shutdown promise; it does not fire the successful process-stopped hook, and the same runtime instance refuses to start again with unconfirmed storage completion. These source semantics require a published and installed daemon update before they apply to an existing installation. Source tests do not verify shutdown of an already running installed daemon.

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

## Desktop lifecycle and error log

See [Desktop daemon startup diagnosis](desktop-daemon-startup.md) for the confirmed competing-startup/socket-cleanup defects and regression verification.

Desktop is a daemon client, including in packaged releases. It waits for an initial connection and protocol handshake, uses the existing daemon, and reconnects without launching another process. When no daemon is reachable, check `todu daemon status`, matching config/data/socket paths, and service logs. If no daemon is running, explicitly run `todu daemon start` or start the configured user service, then reopen desktop. Desktop does not stop your daemon when it exits. On macOS, the bundled CLI is `/Applications/todu.app/Contents/Resources/cli/todu` if you have not installed a CLI on PATH.

Desktop initializes `desktop-error.log` before window creation in Electron's application logs directory. The startup-error dialog reports the exact location. The default packaged macOS location is `~/Library/Logs/todu/desktop-error.log` (development builds may use `@todu/electron` instead); Linux and Windows use `<Electron userData>/logs/desktop-error.log` (usually under the platform's application config directory). Environment/config directory overrides may change these locations. Daemon service/direct-mode logs remain separate.

The desktop log records timestamped startup, disconnect/reconnect, and protocol failures, socket path, available desktop/daemon versions, client protocol, retry context, and underlying errors. Each file is limited to 1 MiB with two rotated archives (`.1`, `.2`). Files use user-only permissions on Unix. Logging uses allowlisted diagnostic context and credential redaction, not task payloads or full configuration. Review logs before sharing them: paths and versions are still local diagnostic information. If logging fails, startup guidance reports the write failure and stderr receives a redacted fallback; the original connection error is preserved.

### Socket ownership and crash recovery

Daemon startup serializes socket publication and cleanup using `<socket>.lock`, waiting up to two seconds for a competing operation. It binds a unique private socket in the same directory and publishes the configured public socket with a no-overwrite hard link. The private basename fits within the configured public basename's byte budget so valid near-limit socket addresses remain supported; short-name collisions are retried without replacing neighboring files. Names are normally dot-prefixed, but a one-byte public basename requires a one-byte private name. The directory must support Unix sockets and hard links. An existing active daemon is never displaced; shutdown and startup-failure cleanup only unlink this instance's public socket, identified by device/inode. Normal shutdown removes the private bind path too.

A crash during startup/cleanup can leave the lock directory. If the error reports a persistent lock, first verify that no daemon is starting/stopping and no service-manager restart is in progress before manually removing that empty lock directory. Do not remove a lock merely because the CLI cannot connect. A crash may also leave a private socket; do not remove unknown socket paths while a daemon is running. Stale public sockets are probed and reclaimed only during serialized explicit daemon startup.

## Troubleshooting

### CLI says daemon unavailable

- Confirm service status (`systemctl --user status ...` or `launchctl print ...`).
- Confirm `TODU_DATA_DIR` is what you expect.
- Confirm socket path matches CLI expectations.

### Daemon starts but CLI still fails

- Run `todu --format json daemon status` and inspect `reason`/`transport.path`.
- Check service logs (`journalctl --user -u todu-daemon -f` or `tail -f` macOS logs).
- In direct lifecycle mode, inspect `<data_dir>/daemon.out.log` and `<data_dir>/daemon.err.log`.
