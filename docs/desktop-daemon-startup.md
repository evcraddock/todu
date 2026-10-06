# Desktop daemon startup failure (task-ae2c6f6a)

## Observed incident

On October 6, 2026, upgrading the Apple Silicon desktop app from 0.23.2 to 0.23.3 produced a daemon-unavailable startup dialog. A CLI-managed daemon remained running and `lsof` showed its Unix listener, but new CLI and backend clients could not connect through the public socket path. Restarting that daemon restored backend connectivity. The historical startup sequence was not captured in a persistent desktop log, so the exact sequence cannot be proven retrospectively.

## Confirmed defects

The installed 0.23.3 desktop starts connecting asynchronously, then immediately requests `daemon.hello`. Before the connection is ready, the connection manager returns `DAEMON_UNAVAILABLE`; desktop interprets that as a reason to launch its bundled daemon. This is not evidence that the existing daemon is absent.

A competing daemon correctly rejects an active socket, but runtime startup-failure cleanup calls `transport.stop()`. The old transport unconditionally unlinks the public socket even when it never successfully bound that socket. This leaves the original daemon alive and previously connected clients potentially working, while new clients cannot reach it. An isolated reproduction with the installed bundle confirmed the active-socket rejection followed by removal of the original socket during cleanup.

There is a related shutdown hazard: Node/libuv automatically unlinks the path used for `listen()` when closing the listener. An inode check only in our explicit cleanup is insufficient if another server has replaced the public path. A separate two-server experiment confirmed that the original listener's close removed its replacement's socket.

These defects provide a concrete mechanism consistent with the incident; tests reproduce the mechanisms rather than claiming to reconstruct historical logs that do not exist.

## Lifecycle decision

Desktop is a client, not a daemon lifecycle manager. It waits for initial connection/handshake completion and uses the configured daemon. Startup/reconnect does not spawn a daemon. When unavailable, it explains how to check status, config/socket alignment, permissions, and how to explicitly start the daemon if absent. Protocol mismatch remains distinct from transport failure. This follows the canonical thin-client/fail-fast architecture and avoids competing ownership of storage, workers, and sockets. Automatic or opt-in desktop daemon management is not introduced in this fix.

The transport binds a unique private path, atomically hard-links that socket to the configured public endpoint without overwriting another endpoint, and removes the public path only when its device/inode still match this instance. A short-lived lock directory serializes startup/stale-socket reclamation and cleanup among updated instances. The native close operation only unlinks the private bind path. Crash recovery precautions are documented in [Daemon Service Operations](daemon-service-operations.md).

## Error logging

Desktop creates a local error log before initialization/window creation. Startup and connection lifecycle failures preserve timestamp, phase, error code, socket path, available versions, retry context, and underlying causes. The startup dialog shows the log location, including when file writing fails. Records are written synchronously, bounded to 1 MiB per file with two archives, use Unix user-only permissions, and redact credentials. Diagnostic context is allowlisted; full configuration, task content, and RPC payloads are not serialized. This policy is local-only and does not send logs to a remote service.

## Package-version finding

Desktop 0.23.3 shipping CLI 0.24.2 is expected: npm packages have independent versions. The release metadata records companion versions (candidate desktop 0.23.3, daemon 0.24.1, CLI 0.24.2, protocol 1). Identical package-version strings are not the protocol compatibility test. See [Release Process](release.md).

## Verification

- Regression coverage reproduces failed competing startup/runtime cleanup, replacement-socket shutdown, concurrent startup, initial connection readiness, permission/refusal/missing-socket diagnostics, protocol mismatch, and reconnect.
- Logging tests cover persistence through immediate process exit, underlying causes, context filtering, credential redaction, file permissions, bounded rotation, oversized records, and write/fallback failures.
- `make pre-pr` passes using Node 24, the CI runtime. Node 26's experimental global `localStorage` caused failures in existing renderer persistence tests; no tests were disabled or changed to conceal that environmental mismatch.
- The candidate macOS arm64 app was packaged locally with automatic certificate discovery disabled (local test bundle only; not release-signing verification). Packaged runtime/content/CLI validation, subscribed daemon shutdown, and persisted reopen passed.
- A packaged GUI smoke test against an isolated daemon opened the renderer, retained the public socket inode, preserved fixture project data, and left the daemon reachable after desktop exit. A separate deliberately absent-daemon fixture produced the new error guidance and persistent log without creating a daemon socket. The test dialog was dismissed and fixture processes stopped; the installed app and live dataset/daemon were not replaced or stopped.

Whole-Electron explicit typechecking currently inherits a root exclusion that produces no inputs; overriding that exclusion reveals existing unrelated agent/tool/client-test type errors. The normal repository checks and Electron production build remain required. The changed connection/startup/logging modules are checked separately rather than treating unrelated errors as new task regressions.
