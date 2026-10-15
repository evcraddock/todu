# Replication sockets surviving shutdown

## Scope and evidence

Task `task-da39158a` follows a live shutdown where managed PID `3631466` remained alive after one SIGTERM and the ten-second graceful-exit allowance. Its private RPC socket disappeared. Logs recorded workers, engine/runtime cleanup, and the process-stopped hook completing in approximately 0.18 seconds, but read-only OS inspection still found 57 established connections to two LAN replication peers. Those connections appear orphaned; the historical creation path of every socket is not established.

Original installed resolution was CLI `0.25.2`, daemon `0.27.0`, engine `0.24.3`, and Automerge WebSocket adapter `2.5.6` on Node `24.16.0`. Engine `0.24.4` shipped identical socket-helper code and the same adapter dependency. A separately approved operational recovery terminated the old process once, installed the API v7 release, and restarted the original catalog successfully. That recovery did not fix this defect or establish remote durability.

## Reproduced mechanism

The pinned adapter's initial retry interval can invoke `connect()` while an earlier HTTP upgrade is pending. Upstream removes callbacks from the previous socket and overwrites its pointer without closing that socket. Earlier handshakes can subsequently establish connections that `disconnect()` no longer references.

The disposable diagnostic used the real adapter, Todu helper and memory-only Repo against a loopback server:

| Handshake | Open before disposal | Open after adapter disposal and Repo shutdown |
| --- | ---: | ---: |
| Immediate control | 1 | 0 |
| Four overlapping attempts | 4 | 3 |

The repository regression holds upgrade responses behind an explicit attempt-count barrier. It verifies zero remaining server-observed connections after cleanup, not merely a cleared adapter pointer. Closed attempts are not upgraded after release. The fixture consumes TCP EOF and mirrors it back even while withholding HTTP upgrade, so a fixture-side half-open socket cannot falsely appear to be a retained client.

A related health-probe defect was also present: `isSyncServerAvailable()` resolved `false` at its deadline without cancelling the outstanding handshake. This is another concrete retained-socket path, not proof of the cause of every historical connection.

## Ownership fix

- The hardening wrapper retains the previous socket across upstream replacement, detaches the actual callbacks captured for that socket, and retires it. Native peer handoff can replace adapter callback properties after attachment; relying only on upstream's current-property removal leaves old handlers attached. A targeted red regression exposed an uncaught handshake-cancellation error on that path; per-socket callback capture fixes the cause rather than suppressing the error. Late close/error events from a retired socket cannot act as the current connection's callbacks.
- Disconnect still performs upstream timer/listener/peer cleanup, then retires its captured socket in `finally`. Node sockets use their public `terminate()` method rather than waiting indefinitely for a remote close-frame acknowledgment; sockets without that method use `close()`.
- This termination concerns only sockets owned by the adapter. It does not terminate a daemon/process, skip admitted worker/RPC drains, change storage flushing, or promise delivery of buffered replication traffic.
- Disposed adapters retain the existing no-reconnect guard; peer identity/readiness and configured-server/native-role control are unchanged. Retirement errors are surfaced rather than reported as completed cleanup.
- Availability probes now retire their owned socket on success, error or timeout, and a module import completing after timeout cannot create a new socket. Constructor/import failures resolve unavailable through a handled promise path.

## Regression coverage

`packages/engine/src/sync-client.integration.test.ts` covers:

- Immediate-handshake control and overlapping initial retries.
- Legacy `connectSyncClient()` disconnect behavior.
- Repeated adapter lifetimes, pending-handshake disposal, repeated disposal and attempted reuse.
- A peer that accepts the upgrade but does not acknowledge WebSocket closure.
- The real native peer lease with its normal initial retry interval and a transferred pending server adapter; unverified peers are not accepted as ready.
- Successful, invalid and timed-out availability probes.
- Natural client-process exit after Repo shutdown while an independent peer is still listening.

The subprocess helper is `scripts/test-helpers/replication-socket-client.mjs`. The parent requires exit code zero and no exit signal before closing its peer. The child clears IPC after reporting shutdown; it does not use `process.exit()`, unreference sockets, or close the independent peer. Forced termination is failure-only fixture cleanup and cannot satisfy the test.

Unit tests also cover retirement of replaced/current sockets, disposed-adapter refusal, the non-Node close fallback, and visible retirement failures. Existing reconnect, native identity, configured-server/peer-role, persistent-storage, daemon drain, legacy provider and packed-package regressions remain required checks.

All validation uses disposable HOME/XDG/storage contexts with inherited `TODU_*` overrides removed and loopback-only fixture servers. No live dataset, actual provider, protected backup, process signal, configuration/assignment change, installation or publication is part of this fix's validation.

## Diagnostic and deployment boundaries

A runtime/process-stopped hook reports completion of tracked cleanup, not observation of OS process exit. CLI transport unavailability likewise does not distinguish a fully exited daemon from one retaining unrelated handles. Natural subprocess exit and explicit resource assertions are therefore separate evidence.

This source change does not claim to identify all 57 historical socket owners, solve startup RPC stalls (`task-0f9f43aa`), or fix arbitrary third-party resources. A release and separately approved installation/restart are required before source fixes affect installed systems. A healthy restart, successful local flush, or lack of local sockets does not prove complete dataset replication or remote disk durability.
