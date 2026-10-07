# Skipped tests and integration coverage audit

Task: `task-f3ec895a` — Resolve skipped tests and integration CI coverage gaps.

## Baseline and deletion policy

The audit ran on Node 24.16.0 with isolated temporary `HOME`, XDG configuration/data directories, and test storage. The original full suite passed 1,799 tests and skipped 14 across 153 files. The original opt-in command ran all 25 tests in its five files: all passed, including the 14 gated cases. There were no failures, unhandled rejections, or storage-race signatures in either baseline. These tests had also passed explicitly during the dependency audit in `docs/security/task-763357bb-dependency-audit.md`; being skipped by default was not evidence that their behavior was obsolete.

Deletion was considered before enabling coverage. Remove redundant setup/checks, misleading assertions, and obsolete descriptions; keep only distinct supported behaviors without equivalent running coverage. The original 14 gated cases become six focused tests. No production implementation change or retry is needed.

## Inventory of skips and exclusions

| Category | Original reason/effect | Disposition |
| --- | --- | --- |
| `TODU_RUN_SYNC_SERVER_TESTS` conditions in five integration files | Local relay-backed coverage required explicit opt-in; default execution omitted 14 cases. The flag itself did not establish an unsupported platform or obsolete behavior. | Removed all conditions. Delete/consolidate the eight redundant cases below; run the six retained behaviors automatically. |
| `vitest.config.ts` excludes `*.integration.test.{ts,tsx}` | Intentional fast unit-only command, also used by `make pre-pr`. | Preserve this useful command; it is not the complete coverage gate. |
| `vitest.all.config.ts` discovers package `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts` | Includes all existing test files. Vitest's default dependency/build exclusions avoid generated and third-party files. | Preserve discovery. No supported source test is excluded from the full suite. |
| `test:integration` passed `--include` | The installed Vitest CLI does not expose this option. | Replace it with the supported filename filter `.integration.test.`; verify the command actually runs the integration files. |
| Linux CI ran unit tests plus selected integration suites | Selected suites covered devices, LAN listening, enrollment, provider checkpoints/field groups, shutdown, and desktop startup; other integration files were omitted. | Replace the incomplete selection with `make test-all` after `make build`, using isolated HOME/XDG directories. Preserve desktop matrix checks on Linux/macOS. |
| Release workflow set the old flag to `0` before unit-only tests | Redundant: the unit config already excludes integration files. | Remove the stale setting; accurately label the step as unit tests. Release packaging policy otherwise remains unchanged. |
| `describeOnUnix` in `packages/daemon/src/transport.integration.test.ts` skips Windows | These ownership/path-boundary cases exercise Unix-domain sockets, hard links, and Unix permissions. Windows named-pipe transport is not implemented; see `docs/ARCHITECTURE.md`. | Preserve the explicit unsupported-platform condition. It is not used on Linux/macOS CI. |
| Explicit `.skip`, `.todo`, `.only`, `.skipIf`, or `.runIf` elsewhere | Source/CI/config search found no additional disabled/pending tests or focused suites. Test titles containing “skip” describe product behavior, not skipped execution. | No further test removals or gates needed. |

Build TypeScript exclusions for `*.test.ts` exclude tests from published artifacts, not test execution. Generated `dist` files, dependencies, and archived documentation are not additional supported test categories.

## All 14 originally gated cases

| # | Original case | Disposition and remaining coverage |
| --- | --- | --- |
| 1 | Remote status becomes connected when relay is available | Delete separate case; the retained remote lifecycle test must establish a real connection first. |
| 2 | `sync.stop()` disconnects and prevents reconnect | Retain in the lifecycle test, including a wait spanning multiple configured watchdog intervals and an unchanged adapter connection count. |
| 3 | `sync.start()` reconnects after stop | Retain in that same lifecycle test; require a connected replacement and exactly one additional adapter connection. |
| 4 | `sync.start()` is a no-op when already running | Delete separate case; the lifecycle test verifies both connected status and unchanged adapter connection count, which is stronger than the original status-only assertion. |
| 5 | Status reconciles an already-connected adapter after stale disconnect | Retain. Adapter unit tests do not cover engine status reconciliation after the real peer handshake. |
| 6 | Repeatedly replaces stale adapters without retaining resources | Retain. Unit disposal tests do not exercise the engine watchdog/Repo integration across repeated connections. Preserve socket/listener disposal, exact adapter count, local-operation latency, warning, and outdated-document checks; also verify the task remains readable. |
| 7 | Server creates data, ephemeral client reads it | Delete separate case; the retained note-bucket round trip verifies the server-created project and dependent note are visible to the SDK client. |
| 8 | Ephemeral client creates data, server sees it | Delete separate project-only case. The retained round trip requires a client-created journal bucket to arrive at the server. Bidirectional project replication between current persistent peers also runs in `sync-listener.integration.test.ts` and `enrollment.integration.test.ts`. |
| 9 | Note create/update across server and ephemeral client | Retain as the focused bidirectional note-bucket test. Local notes CRUD and project replication do not verify loading the referenced note documents or propagating their edits. Add tags and close/reopen assertions for received edits and the client-created journal. The SDK still publicly exposes `syncClient`/`syncServer`; removing those APIs is outside this task. |
| 10 | Ephemeral client does not write to disk | Delete this misleading case: its file-count assertion was `after >= before` while a persistent server shared the directory, so it never proved the title's claim. Its meaningful close/reopen persistence assertion is covered by the retained note round trip and `projects.integration.test.ts` / `storage.integration.test.ts`. This audit does not claim a new no-client-writes guarantee. |
| 11 | Sync-server mode reports correct status | Delete separate setup-only case; assert the same mode/disconnected values in the retained SDK round trip. |
| 12 | Ephemeral-client mode reports correct status | Delete separate setup-only case; assert the same mode/disconnected values in the retained SDK round trip. |
| 13 | Daemon emits `sync.statusChanged` for stop/start | Retain. Renderer/TUI event handling and engine status tests do not prove real daemon RPC subscribers receive both transitions. |
| 14 | Authority migration between source/destination daemons | Retain and rename to relay-backed dataset join with source restart. The current architecture has equal peers, not a primary authority; this case must work with two default node-role daemons. Local join tests do not verify remote graph reachability, replication while the source is stopped, or convergence after its restart. |

## Other redundant cases removed

- The ungated URL and initially disconnected checks in `remote-sync.integration.test.ts` become one configuration test with a mocked connection, avoiding contact with a development server on port 3030.
- Remove the obsolete “remote sync not yet implemented” no-op test and standalone status-only test with `sync-status.integration.test.ts`. The existing no-remote-configuration test now verifies standalone mode and undefined server/lastSync fields as well as start/stop no-ops.
- Remove the duplicate standalone create/read/reopen case from `sync.integration.test.ts`; `projects.integration.test.ts` already verifies the same persistence behavior.

The focused sync-server command now runs 13 tests in four files rather than 25 in five. Six cases require a real relay; the other seven retain configuration, local-operation, data-event, and transactional-join coverage.

## Isolation and failure handling

Shared test setup uses the existing ephemeral-port reservation pattern from the LAN/enrollment integration suites, binds the reservation and server to `127.0.0.1`, and checks a real WebSocket handshake before returning the relay. Port allocation/bind errors fail the test; they are not retried. Each test owns temporary storage. Cleanup runs in hooks even on assertion failure, stops clients/daemons before relays, waits for engine storage close, and removes directories only after successful shutdown. Arbitrary server-start and storage-settling sleeps are removed. A stop-observation interval and bounded synchronization polling remain behavioral checks, not failure retries.

No test changes production configuration, uses a live daemon, or contacts live provider integrations. The full Vitest command retains its default failure behavior for uncaught exceptions and unhandled rejections. No retries, ignore-unhandled-error options, or relaxed assertions are introduced.

## Verification

| Check | Result |
| --- | --- |
| `make pre-pr` | Passed formatting/lint/typecheck, all 1,171 unit tests in 99 files, and all package builds. |
| `make test-all` with isolated HOME/XDG/TMPDIR | 1,801 passed in 152 files; zero skips, failures, or unhandled errors. |
| `make test-integration` with the corrected command | 630 passed in 53 integration files; zero skips or failures. |
| `npm run test:sync-server-integration` | 13 passed in four files without opt-in; five additional consecutive runs each passed all 13. |
| `STORAGE_STABILITY_RUNS=10 npm run test:storage-stability`, twice | Both complete batches passed 10/10 runs: 20 successful runs, each with all ten storage cases passing. |
| Log scan for unhandled errors, `ENOENT`, `ENOTEMPTY`, and outdated-document signatures | None in the final full/integration/focused/stability runs. Expected CLI validation-error output is not an unhandled error. |
| `git diff --check` | Passed. |

An earlier combined focused-plus-storage command reached the tool's 120-second execution limit after 14 successful storage runs and during run 15. That interrupted batch is not counted as a completed stability check. The two complete ten-run batches above kept each tool invocation within the limit; no failing test was retried or concealed.

Linux/macOS remote CI results and independent review are reported on the PR. Windows remains outside the implemented private-transport support described above.
