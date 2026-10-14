# Worker shutdown completion investigation

## Proven defect

Task `task-dd366803` investigates direct daemon stop reporting successful runtime/process shutdown while the process remains alive and the CLI eventually reports forced termination. Historical production occurrences are not replayed against live data.

An isolated source subprocess with an API v4 provider and a persistent subscribed RPC client reproduced the premature-completion defect. Its provider shutdown waited on a controlled fixture gate with a referenced timer. Before the fix, worker stop returned immediately, the engine closed, and the entrypoint logged `daemon process stopped` approximately 123 ms after shutdown began while the child was still alive and provider cleanup was unfinished. This was an actual pending-resource case, not a zombie PID mistaken for an executable child. The regression failed at the premature successful log assertion; cleanup released the fixture gate.

The host-owned sync worker previously returned no completion promise. An active cycle deferred provider shutdown without giving the host a way to await it, and provider shutdown errors were logged but swallowed. Generic worker stop also allowed no completion return in its documented contract. These are concrete lifecycle defects; the fixture does not establish every historical production root cause.

## Correction and boundaries

- Explicitly negotiated `context.capabilities.awaitableStop` permits a generic worker handle to return a completion promise. Legacy synchronous stops remain supported; an async implementation must check support before allocating resources and refuse unsupported hosts or provide real synchronous cleanup.
- The host requests all worker stops and awaits returned completions alongside admitted RPC-handler draining before closing storage. Pending snapshots are not completion receipts; conflicting transitions/reactivation are rejected. Failed cleanup remains visible and prevents runtime reuse or a dataset switch over unconfirmed storage.
- The host-owned sync worker stops future scheduling, drains the admitted cycle, and awaits provider cleanup. It does not start another binding after stop. Provider shutdown rejection now reaches the host shutdown failure path. Existing v3/v4/v5/v6 payloads, acknowledgment semantics, and contracts are unchanged.
- Source recurring-worker stop cancels future intervals and waits for admitted startup/interval processing. The published legacy worker is unchanged and cannot acquire this guarantee merely through a daemon update; publication/deployment is a separate decision.
- No longer CLI timeout, blanket failure suppression, forced-exit shortcut, universal provider abort signal, production restart, backup access, or live data/configuration change is part of this correction. Long-running uncooperative work can still exhaust the existing deadline and must be reported as failure.
- Providers and synchronous plugins must release resources before their shutdown completion; the host cannot discover work hidden after a synchronous return or a prematurely resolved promise. Natural exit and local persistence are not remote replication/durability proofs.

## Regression coverage

| Coverage | Evidence |
| --- | --- |
| Pending provider initialize, pull, acknowledgment, push, and shutdown | Ten subprocess cases, each with persistent or disconnected subscribed clients; no premature successful completion, natural exit with code 0/no terminating signal, and exact retained task/description/note values after reopen |
| Direct CLI lifecycle | Compiled CLI start/restart/stop with an active gated API v4 provider, subscribed/disconnecting clients, and the compiled source recurring worker; zero lifecycle errors/no forced termination, new managed PID, healthy same-catalog restart, retained history, and exactly one generated occurrence |
| Generic worker compatibility and completion | Legacy synchronous stop remains immediate; asynchronous repeated stops share completion and keep truthful snapshots; reactivation/conflicting transitions fail while cleanup is pending |
| Failure handling | Synchronous/asynchronous worker failures drain other workers and disconnected admitted RPC work before surfacing; engine close is not falsely performed, runtime reuse is refused, and failed worker cleanup aborts join before changing the marker/opening another engine |
| Recurring adoption | Missing/false host capability refuses activation before resources are allocated; startup/interval work drains and no new cycles are scheduled after repeated stop |
| Existing safeguards | Existing storage/process failure propagation, connected-client teardown, admitted mutations, native storage persistence, and legacy provider regressions remain enabled |

All fixtures use disposable HOME/config/data/socket paths and controlled local providers. They do not load production configuration, access protected snapshots, contact real providers, or test the installed production daemon. These are RPC/TUI-style client protocol fixtures, not a graphical TUI/Electron smoke test.

## Startup latency outcome

A focused local verbose run recorded:

- Ten subprocess cases: spawn-to-provider/readiness observation approximately **303–354 ms**; raw status RPC approximately **1.5–1.9 ms**, including while a provider phase was deliberately pending.
- Direct CLI fixture: spawn-to-successful-status approximately **1.05 s**; status command approximately **168 ms** including CLI startup/handshake; restart approximately **2.47 s** including graceful cleanup, new startup, and subsequent status.

These are small-fixture observations, not performance thresholds or production SLAs. The direct restart test still checks the existing ten-second allowance; no timeout was enlarged. Timing records are emitted as `SHUTDOWN_STARTUP_TIMING`, `DIRECT_STARTUP_TIMING`, and `DIRECT_RESTART_TIMING` in the focused verbose output.

Historical approved restart observations included transient ten-second client timeouts and task reads around 20–22 seconds under client refresh traffic. Those production-sized stalls were **not reproduced** by these isolated fixtures. There is no evidence establishing a common cause, so this fix does not claim to resolve startup latency. A separate investigation is recorded as **`task-0f9f43aa` — Investigate startup RPC stalls after daemon restart**; it does not block the proven shutdown correction.

## Verification commands

```bash
make pre-pr
make test-all
npm run test:all -- packages/daemon/src/shutdown.integration.test.ts packages/daemon/src/worker-stop.integration.test.ts packages/cli/src/commands/daemon-worker-stop.integration.test.ts --reporter=verbose
```

Run these with isolated HOME, XDG config/data directories, and inherited `TODU_*` overrides cleared, as documented in [Contributing](../CONTRIBUTING.md). The full suite retains existing CLI lifecycle, daemon shutdown/transport, provider reconciliation, and persistent-engine coverage.
