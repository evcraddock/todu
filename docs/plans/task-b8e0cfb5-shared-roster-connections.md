# Implementation Plan: Shared-Roster Connections

## Work Summary

- Task: `task-b8e0cfb5` — Connect devices using the shared roster.
- Status: implementation plan approved by Erik. Local implementation/checks are in progress; CI, independent review, merge approval, and manual production observations are tracked separately.
- Objective: read the existing catalog roster at daemon startup or on an explicit reload, and use existing native Automerge adapters for the listed peer endpoints.
- Verification approach: test what is practical in the available local environment. Real multi-device synchronization and failure scenarios will be checked manually in production after an approved deployment, not through an elaborate simulated fleet.
- Out of scope: automatic roster watching, interface discovery/address tracking, implicit listener enablement, new retry schedulers, replication/forwarding protocols, connection-election algorithms, catalog redesign, global pause/status redesign, or publication.

## Behavior

1. Enrollment includes the device's advertised listener endpoint with its existing native ID and name.
2. Use the already-published local endpoint or derive it from the configured concrete listener address and port. Only require an override if the address is ambiguous, such as a wildcard binding. Do not discover interfaces or silently enable listening.
3. When an active daemon starts, read other active roster entries with valid endpoints and attach native adapters for the current catalog route. Exclude self and removed entries.
4. `todu sync peers reload` rereads the roster: keep unchanged connections, dispose removed/replaced managed adapters, and attach new ones.
5. Roster edits do not change running managed connections until reload or restart. Reload does not modify the local listener, own advertised address, dataset, server configuration, or worker assignments.
6. Reuse existing native synchronization/retries and Todu error handling/disposal. Do not wait for every peer to be available, add a retry scheduler, or create a custom relay.
7. Reuse matching existing enrollment/configured-source links where appropriate. Preserve separately configured server operation and close owned resources before storage teardown.

## Stage 1 — Enrollment Metadata

**Status:** implemented; local checks pass.

- Update `packages/daemon/src/enrollment-runtime.ts` to obtain the advertised endpoint from local configuration or an existing published endpoint, with an optional explicit override.
- Extend `packages/cli/src/commands/sync-enrollment.ts` and the enrollment request/client validation where needed to carry that endpoint through approval into the existing roster entry.
- Validate explicit listener setup, including configured pristine pending setup. Preserve historical enrollment journals, existing membership, idempotent retries, and different-dataset refusal. Do not rewrite listener configuration.

**Checks:** single-daemon/validator tests cover configured-address reuse, ambiguous configuration, optional override, request metadata, approval insertion, and retries. No remote daemon is started; use the existing request/client test seams.

## Stage 2 — Startup and Reload Wiring

**Status:** implemented; local checks pass.

- Add a small engine helper for roster snapshot selection and managed adapter reconciliation, using `devices.ts`, `sync-client.ts`, and native adapter APIs rather than a new networking framework.
- Wire it into daemon-owned engine startup/activation and shutdown through `packages/engine/src/index.ts` and `packages/daemon/src/runtime.ts`. Pending enrollment and thin clients must not own roster connections.
- Add private `sync.peersReload` registration/handler and `todu sync peers reload`, using existing RPC/CLI patterns. Update necessary engine types/stubs and capability tests.
- Keep refresh idempotent, nonblocking for unavailable targets, and safe against overlapping reload/close calls. Retain existing native identity/current-catalog checks and server/enrollment link reuse. Do not invent a connection-election protocol.
- The existing adapter helper alters reconnect ownership; verify its use at the test boundary and reuse the existing lifecycle path rather than adding another retry loop.

**Checks:** mocked native adapters verify correct target URLs, unchanged-link reuse, add/remove/replace operations, repeated reloads, source/server reuse, identity/error handling, and shutdown disposal.

## Stage 3 — Practical Local Checks

**Status:** implemented; focused and full-suite checks pass. Final verification and production observations remain separately reported.

- Use the available local daemon/engine test fixtures, temporary storage, and simple adapter/client mocks where useful. Do not build a simulated fleet or new network-testing infrastructure.
- Cover the wiring Todu adds where practical: configured endpoint reuse/validation, roster filtering, adapter calls, startup versus explicit reload, unchanged behavior before reload, repeated reload/disposal, and CLI/private API responses.
- Reuse existing transport/replication code and tests. Do not attempt to reproduce every outage, sleep, address-change, or multi-device convergence scenario locally.
- Preserve existing tests and supported-platform CI. Run new focused tests through the existing commands; no additional systems or dedicated multi-peer CI step.
- Record the limits of local coverage explicitly. Mocks demonstrate local wiring, not successful exchange between real devices.

**Checks:** practical focused tests and existing relevant checks pass. Real multi-device outcomes remain unverified until manual production testing; no elaborate harness is required.

## Stage 4 — Documentation and Delivery

**Status:** documentation/checklist implemented; PR delivery and approval gates pending. No production deployment or testing performed.

- Update `docs/architecture/device-sync.md`, `docs/ARCHITECTURE.md`, `docs/cli-daemon-usage.md`, and `docs/daemon-service-operations.md` to explain address reuse during enrollment, startup snapshots, explicit reload, and trusted-LAN limits.
- Explain that roster entries are connection metadata, not authentication/revocation; address changes/removal affect managed connections only on refresh. Existing endpoint-less entries remain readable and require explicit publication before becoming targets.
- Add appropriate Changesets entries for changed published packages without applying versions or publishing.
- Run focused tests, `make pre-pr`, and built/isolated `make test-all`, using temporary HOME/XDG paths and no live daemon/provider settings.
- Commit/push a task PR; wait for existing CI and independent visible review. Stop for explicit merge approval and verify exact-commit post-merge CI.
- Provide a short manual production checklist: enrollment publishes the expected endpoint; startup/reload connects actual devices; adding/changing an endpoint takes effect after reload; remaining reachable devices synchronize when another is offline; restart/reconnection behaves as expected. These are verification steps, not new replication features or automated test infrastructure.
- The user will verify real-device behavior in production. Do not deploy, modify live settings/data, or run production experiments without separate explicit approval. Record observed results and outstanding scenarios honestly before the separately approved close gate.

**Checks:** documentation matches implemented behavior; local checks and existing supported-platform CI pass; production observations are distinguished from local evidence. Review, merge, production actions, and closure retain their approval boundaries.

## Acceptance Evidence

- Enrollment identity/name/endpoint registration: local validation/request/approval tests and existing catalog replication capability.
- Startup peer selection: one-daemon fixture and mocked native adapter calls.
- Reload additions/removals/address replacement/idempotence: snapshot reconciliation tests.
- No live roster reconciliation or configuration mutation: single-daemon API tests and before/after state assertions.
- Native retries, replication, and local availability: reuse existing code and dependency behavior; test Todu's nonblocking adapter wiring and error isolation, not a new replication system.
- Identity/current-catalog and source/server compatibility: existing checks plus mocked boundary/reuse tests.
- Real-device behavior: manual production observations supplied by the user after deployment, with untested scenarios explicitly outstanding. Do not claim source-offline multi-peer exchange was executed locally.
- Quality and documentation: existing project checks, CI, and independent review; these do not substitute for real-device observations.

## Start Gate

- [x] Human approves this simplified plan.
- [x] Update local `main`, create the task branch, and preserve this plan artifact.
- [x] Set the task `inprogress` only when implementation starts.
- [ ] Follow existing contributing/code/architecture instructions; after three failed attempts at the same issue, stop and ask for guidance rather than adding workaround layers.
