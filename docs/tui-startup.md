# TUI startup feedback and measurements

Task: `task-fff5045a` — Investigate startup lag and show TUI loading status.

## Startup states

The TUI is a client of an explicitly started local daemon; it does not start a daemon, open Automerge storage, or wait for remote sync to finish.

1. **UI initialization:** interactive stdout immediately shows `Starting Todu TUI…` while Ink, React, and the app modules load. The message is cleared before Ink renders. Help/version modes skip UI loading and terminal feedback. Redirected stdout receives no startup message or cursor controls. Import/synchronous render failures report `Todu TUI startup failed` on stderr and exit unsuccessfully; Ink retains its own handling of later render errors.
2. **Connection/handshake:** the existing connection view shows the socket being connected. No Home query starts until `daemon.hello` succeeds. Initial connection failures show daemon-start guidance; reconnect behavior remains unchanged. The default socket timeout is 2 seconds, request/hello timeout is 10 seconds, and reconnect delays are capped at 2 seconds.
3. **Initial Home data:** `Home • loading…` and `Loading tasks from local daemon…` remain visible while the initial `task.list` request is pending. Empty sections are not shown before a successful response. If a pending query is disabled during disconnect, the message says `Waiting for daemon connection…` instead.
4. **Ready/failure:** a successful initial response shows `Home • ready`, including genuinely empty sections. A failed request shows `Home • failed` and the existing actionable `Tasks unavailable` error; it is not reported as empty or ready.
5. **Refresh:** previously loaded tasks remain visible during background refresh, with `Home • refreshing…`. Cached views remain usable during reconnect, alongside the app's connection warning.

`Ready` means the local Home query succeeded, not that every project, remote peer, or background sync has completed. Other routes retain their existing loading/error handling, and navigation/quit remain available during Home loading.

## Measurement method

Build the workspace, then run the isolated diagnostic:

```bash
make build
node scripts/measure-tui-startup.mjs
```

The script prints JSON Lines with milliseconds measured from each standalone TUI child-process launch. It runs three trials each for an immediately responding fixture, a 1-second delayed `task.list`, a 1-second delayed hello, an injected task timeout error response, and an absent socket. It records frame markers and request/response times, quits the child, and fails on abnormal exit or a 5-second deadline. Each fixture uses a fresh temporary Unix socket; the script overrides the socket path and never connects to the live daemon.

The child has terminal capabilities emulated on pipes (100 columns, 30 rows) so Ink emits interactive frames. This is not a physical terminal, macOS packaging test, CLI-wrapper measurement, or remote sync benchmark. Render scheduling means a brief intermediate state can legitimately be skipped for a fast response; the delayed scenarios exercise visible pending states.

The final three trials measure real persistent-engine loading, without remote sync or workers. The script seeds 10 projects, each with 20 tasks and 1,000-character descriptions, closes storage, and reopens the dataset for each trial. It times engine initialization, first Home-style task listing, and a second listing. The engine/WASM is already initialized in this process and filesystem caches are not flushed, so these are repository-reopen measurements, not cold-OS/process startup benchmarks. Temporary fixture data is removed after the engine closes.

## Findings

Measurements on Linux x64, Node 24.16.0, with the built workspace on the task branch:

| Scenario | Baseline | Candidate |
| --- | --- | --- |
| Early feedback | First Ink output at 242–249 ms in normal trials | Startup text at 20–21 ms in normal trials |
| Normal empty fixture | Loaded frame at 294–301 ms | Ready/empty frame at 296–308 ms |
| Delayed task response | `No tasks` appeared at 295–309 ms, before response at 1,258–1,271 ms | Loading body at 290–301 ms; ready/empty only at 1,258–1,269 ms |
| Delayed hello | Connection guidance appeared at 287–290 ms | Connection guidance at 284–293 ms; data loading follows hello, ready at 1,295–1,304 ms |
| Injected task error | Existing task error at 290–306 ms | Explicit failed state/error at 299–313 ms |
| Absent daemon | Start guidance at 281–285 ms | Start guidance at 294–298 ms, preceded by startup text |

These small differences in ready times are not evidence of a startup-speed improvement. The fix reduces silent initialization and makes pending/failed states truthful; it does not optimize daemon data loading. The one-second delays are injected, not observed production latency. Baseline first Ink output can include terminal controls, whereas candidate early feedback is readable text.

A separate real local-storage sample (same 200-task fixture) measured:

| Trial | Engine reopen | First task list | Second task list |
| --- | --- | --- | --- |
| 1 | 18.2 ms | 198.7 ms | 0.39 ms |
| 2 | 4.8 ms | 166.2 ms | 0.46 ms |
| 3 | 5.0 ms | 163.8 ms | 0.44 ms |

This demonstrates that initial task-document hydration can add noticeable latency even without a sync server. In `packages/engine/src/tasks.ts`, an unscoped list loads project task-list documents sequentially through `repo.find`, migration, and description-index backfill before filtering statuses. Initial Home listing is unscoped. The daemon can finish catalog initialization before these documents load; connection readiness is therefore distinct from Home readiness. Legacy description-index backfill may load detail documents, but its impact on the user's dataset has not been measured.

## Remaining uncertainty and follow-up

The reported common startup lag has not been reproduced against the user's dataset, and its exact duration/cause remains unproven. The isolated observations establish UI-module initialization and lazy local data loading as measurable phases, not remote sync as the root cause. Missing locally replicated documents could require peer hydration, but that was not exercised here. No live daemon was restarted and no live dataset was opened or changed.

For a follow-up investigation, collect opt-in, content-free timings for CLI-wrapper launch, socket/hello, catalog load, per-project task-document hydration/backfill, and first rendered data on the affected machine. Compare first versus subsequent opens and online versus offline behavior using safe fixture copies. Do not infer full remote synchronization from local query success.

Desktop follow-up: apply the same separation between module/window initialization, daemon handshake, and initial queries. The desktop startup fix already waits for connection readiness and records startup errors; it does not establish initial-data readiness or explain slow document hydration. Desktop UI/instrumentation and engine hydration optimization are outside this change.

## Verification

Regression tests cover initialization feedback before deferred UI loading, import/render failure, redirected output, delayed connection followed by delayed data, normal/empty readiness, failed initial data, disabled queries, cached background refresh, and quitting while loading. Existing connection tests cover hello timeout, unavailable sockets, and reconnects.

```bash
npm run --workspace=packages/tui test
make pre-pr
node scripts/measure-tui-startup.mjs
```
