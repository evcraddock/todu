# Safe provider initialization and recovery (API v7)

## Scope and implementation stages

This is the provider-neutral host contract for `task-6daf1fb2`, building on the v6 scoped identity/lifecycle service from `task-c5d79d45`. It supplies the host prerequisite for Forgejo adapter task `task-417bb5b9`; it does not adopt or deploy that adapter. All examples describe isolated fixtures, not authorization to migrate a live dataset.

- [x] Explicit v7 contracts and negotiation; v3–v6 remain supported unchanged.
- [x] Canonical scoped observation, guarded initialization, and persisted-value receipts.
- [x] Bounded durable v4 drain/recovery fixture verification.
- [x] Separate local operator workflow intent, native engine guards, and local RPC tests.
- [x] Documentation and isolated local checks (1,369 unit / 2,231 full-suite tests).
- [ ] CI, independent review, and human merge approval.

## Version negotiation

Declare `apiVersion: SYNC_PROVIDER_API_VERSION_V7` and implement `SyncProviderV7`. The host validates `recoveryState`, `pull`, `acknowledgePull`, `push`, `initialize`, and `shutdown`. A host supporting only v3–v6 must reject v7 at registration; do not fall back to a legacy version or omit safety fields. Existing providers must keep their explicit version declaration. The latest-version constant is an explicit opt-in, not a promise that an older implementation satisfies the new contract.

V7 inherits the v6 identity resolver and cancellation-exclusion contract. V6 remains metadata/lifecycle-only; extra fields on a v3–v6 registration do not enable initialization. Keep original callback argument counts, checkpoint behavior, conflict selection, and import/approval behavior for those versions.

## Read-only canonical observation

During `pull(binding, project, context)`, use `context.observeTaskGroups({ localTaskId, externalId, sourceUrl })`. It uses the same scoped identity resolver as `context.resolveTask`, not a competing lookup service. All supplied selectors must agree, and missing/ambiguous/contradictory identity cannot authorize a write. Resolution never searches unrelated projects.

A found result contains the real local identity, clock, source reference, an invocation-local opaque `observationToken`, and four immutable groups:

- `content`: normalized stored title/body, or `deferred: pending-content-approval`.
- `workflow`: the actual status, including native spelling `canceled`.
- `classification`: priority and a canonical label set.
- `assignment`: the complete canonical external identities for the actual local actors, or `deferred: incomplete-assignment-mapping`.

An empty complete assignment is a known empty set. A missing actor, nonunique mapping, missing external identity, or missing project authorization makes the entire assignment unknown/deferred; never export a partial set. V7 does not create or authorize missing assignees merely to establish equality. Operators can use the existing mapping/authorization controls, then a new pull can observe a complete value. Imported comment authors/provenance remain host-owned and mapping persistence uses a binding-current precondition.

The context exposes no engine, mutable task namespace, filesystem, operator-intent service, or unrelated actor registry. It expires when `pull` settles; reads finishing after expiration do not issue tokens. Tokens cannot be saved in a pending batch for reuse after retry/restart. Preserve the original pending payload and obtain fresh observations each invocation.

## Explicit unknown baseline and safe default initialization

Every v7 update supplies `externalId`, an optional asserted local ID, a current `observationToken`, and complete values for its supplied groups. Each group uses one of:

```ts
{ base: { state: "unknown" }, remote: normalizedRemoteValue }
{ base: { state: "known", value: provenMirroredValue }, remote: normalizedRemoteValue }
```

An unknown baseline cannot carry a value. Known empty content/labels/assignments remain ordinary known values. Unknown inputs are validated independently and are never transformed into fabricated v5 bases.

Acquire the local observation token before reading/revalidating the authoritative remote values used for initialization. Cached discovery or an old pending payload alone is not a fresh remote equality observation; retain that original work, but reobserve or defer initialization if its current remote values cannot be checked. The host guards local freshness and checks equality to the provider-supplied observation; it cannot independently prove external API freshness or remote disk persistence.

For unknown history, the only automatic policy is verified equality:

1. If complete canonical local and observed remote values agree, establish a common baseline without rewriting either side.
2. If they disagree, preserve the local value and return `baseline: unproven`, `reason: initialization-disagreement`, and `remoteWriteRequired: false`. This is deferred initialization, **not** a local-wins decision or permission to overwrite the remote value.
3. If approval or mapping prevents a complete observation, return an explicit deferred reason. No baseline is established.

There is no implicit remote-wins/local-wins initialization policy in this implementation. Preserve discrepancies for operator review; a future reconciliation policy needs separate explicit authorization. Never infer group history from a record timestamp, discovery, presumed application, bootstrap acknowledgment, or successful push of another group.

Known bases retain the existing v5 three-way reconciliation algorithm. Groups can have different winners. Local winners require a remote write and remain unproven as mirrored until that write is verified. Omitted groups are not modified.

## Bootstrap and persisted receipts

V7 returns `bootstrapResults` for every row in `tasks` and `taskResults` for every row in `taskUpdates`, in their original order. Each receipt contains the actual durable local ID and canonical external identity. Bootstrap is creation/observation, not permission to replace existing linked records: older existing payloads are observed and their actual saved values returned, rather than reported as if requested values won. Contradictory links, duplicate identities, and newer linked whole-task replacements fail closed.

Per-group receipt states are:

| State | Meaning | May advance a mirrored baseline? |
| --- | --- | --- |
| `persisted`, `baseline: mirrored`, `remoteWriteRequired: false` | Actual local value was flushed and verified equal to the observed remote value | Yes, for this group and batch only |
| `persisted`, `baseline: unproven`, `remoteWriteRequired: true` | A known-base local winner needs a remote write | No; durably stage the required write |
| `persisted`, `baseline: unproven`, `reason: initialization-disagreement` | Actual local value is known; unknown-history values disagree | No; retain deferred initialization |
| `persisted`, `baseline: unproven`, `reason: remote-value-unknown` | Actual local value is known but the bootstrap did not supply a complete remote group | No |
| `deferred` | Approval/mapping prevents a complete eligible value | No; never substitute an empty or partial value |

Stored imported content remains subject to approval; storing a pending body is not permission to mark it approved or seed its baseline. A later approved observation can initialize equality without rewriting content.

The host validates before application, uses engine mutation-boundary identity/value/clock/scope guards, persists mappings, awaits native local flush, and verifies complete expected task snapshots and current scope before invoking acknowledgment. Same-millisecond content/approval changes are checked by values/revisions, not the whole-record timestamp alone. Native guards are private host services; no provider callback or await intervenes between the final authoritative check and acknowledgment invocation. This is a callback-invocation freshness boundary, not a lock throughout an asynchronous acknowledgment or a distributed transaction. Later edits require fresh observations in the next cycle.

V7 treats mixed before/after content in a retained interrupted-write record as ambiguous, even with the same clock. A staged record alone cannot prove whether those values came from an interrupted host write or a concurrent local edit. Retain the record and original batch and require explicit resolution rather than automatically repairing over a possible local edit. Existing v5/v6 recovery behavior remains unchanged.

A failed validation, apply, mapping write, flush, verification, or acknowledgment does not authorize progress. Already-applied unrelated imports are not rolled back. Keep original payloads, stable IDs, source timestamps, cursor boundaries, content-recovery records, and pending writes so the next pull can replay against fresh local state.

## Provider-owned durable acknowledgment and push

The provider owns its pending ledger and opaque checkpoints; the host does not decode or store that ledger in replicated binding options. Validate receipt count, order, IDs, group membership and states against the original staged batch. Commit only the supplied checkpoint. Before reporting acknowledgment success, durably retain every unresolved initialization group and required remote write independently of the read cursor. An acknowledgment that commits and then throws must be idempotently recoverable without losing those records.

V7 push receives `ExportedTaskInputV7`, whose user fields live in the explicit known/deferred `groups` envelope, rather than flattened values that could conceal incomplete assignment. Identity, source URL, clock and groups come from the same authoritative task snapshot. Private native scope/task/detail/comment-bucket revision guards are captured before asynchronous comment/provenance reads and recovery-readiness callbacks; the host rechecks them synchronously immediately before invoking push. Relinking, same-clock edits, changed comments, or changed binding/project/actor scope reject the export without invoking the provider, rather than combining an old address/clock with new values. A later cycle rebuilds from fresh state; unlinked outbound creation remains supported. This guards invocation, not arbitrary later external API writes inside an asynchronous provider. These exports prove local availability, not historical mirroring. Providers must not overwrite disagreements/deferred groups just to seed history, must write only groups permitted by proven history or explicit operator policy, and must preserve unrelated remote fields. The host cannot prevent trusted in-process plugin code from making arbitrary external API calls; this is the provider adoption contract, not a sandbox.

A remote write must be verified before advancing its group's mirrored base. Push success must never commit a pull checkpoint. Pull-only receives observations and persistence receipts without needing push. Push-only receives grouped exports but no fabricated pull context/receipt/progress. Bidirectional acknowledges local pull persistence before push; a later push failure must retain pending writes without undoing or fabricating read progress. Disabled/`none` bindings do not execute provider work.

## Bounded legacy v4 drain before cutover

The selected route is **drain, not automatic conversion**. A v7 provider must inspect its durable ledger in `recoveryState(binding, project)` before any pull or push:

```ts
{ state: "ready" }
{ state: "legacy-pending", batchIds: ["original-batch-id"] }
{ state: "unknown", reason: "pending ledger could not be read" }
```

Only the exact ready state admits v7 work. Legacy-pending, unknown, malformed, and unreadable state block the binding with actionable v4-drain diagnostics. This is an explicit provider declaration based on its durable ledger, not host inspection of provider-private storage. A version bump alone does not prove readiness.

A separately approved adapter cutover must implement this bounded procedure:

1. Freeze the set of original pending v4 batches and their opaque checkpoint boundaries. Keep exact payloads, identities and timestamps; do not fetch/commit a new remote read window as a way to bypass them.
2. Continue with the v4 provider/contract only for that frozen pending work. Apply through its existing replay rules, preserve genuinely newer local edits, flush, and acknowledge the original checkpoint. Stop the drain at that captured boundary; do not use an unbounded sync loop as a migration tool.
3. On apply/flush/acknowledgment failure or restart, keep the original pending record and retry that same boundary. Equal-clock partial-description replay uses the existing v4 repair behavior; do not pretend v4 provides exact per-group history or change its established semantics in place. If provenance or identity cannot establish safe recovery, remain blocked and retain the payload for explicit operator resolution.
4. Only after the original work is durably acknowledged may the provider mark the legacy queue drained and register v7. Start with actual fresh observations; a completed v4 acknowledgment does not manufacture per-group mirrored bases.
5. Keep any v7 deferred initialization or required remote writes durable and separate from pull progress. Do not clear them merely because legacy drain completed.

This host change does not implement a provider-specific ledger migration, automatic downgrade, operator command, or live cutover. The fixture provider exercises the route using disposable storage. Older architectural notes describing disposable sample integrations do **not** authorize discarding real batches or data during this adoption.

## Separate local operator workflow intent

For a separately confirmed remote-deletion workflow, the private local daemon advertises two RPC methods:

```json
{"method":"integration.prepareWorkflowIntent","params":{"input":{"bindingId":"ibind-example","localTaskId":"task-example","externalId":"canonical-remote-id","intent":"cancel","reason":"confirmed-remote-deletion"}}}
{"method":"integration.confirmWorkflowIntent","params":{"input":{"token":"host-issued-preview-token","confirmed":true}}}
```

Supply `sourceUrl` when the current link has one; omission is an exact assertion of no source URL, not a wildcard. Preview reports the actual binding/project/task identity, current status, fixed target `canceled`, and expiry. Confirmation requires explicit `true`, rejects additional mutation fields, consumes the token, and verifies all current native identity/scope/revisions before a status-only mutation. Tokens expire after five minutes, cannot cross host/restart boundaries, and cannot be reused after success or failure.

This explicit operation can cancel a previously reopened or completed task without pretending that a normal LWW update must win. Ordinary task transitions and ordinary provider payload semantics are unchanged. Only status and the normal local edit clock change; content/approval/classification/assignment/identity/comments are untouched. Successful receipts follow local flush and verification; a flush failure may leave an applied local change but never produces a success receipt. Prepare again rather than replaying the old token.

Freshness is deliberately conservative: even unrelated edits in the captured catalog, registry, project task-list, or detail document can invalidate preview. Concurrent edits require another preview/confirmation, never an automatic forced cancellation.

These methods use the daemon's existing private UDS permission boundary; no new network endpoint or authentication bypass is introduced. In-process providers are trusted executable code, not a security sandbox, but their pull contexts/results do not carry this authority and arbitrary pull `operatorIntent` extensions are rejected. The host does not detect remote deletion or prove a caller's confirmation claim. Detection/confirmation/tombstone consumption remains `task-f4d98619`, through Forgejo adoption.

## Verification boundaries

Real native engine and daemon fixture tests cover canonical observations, equality/disagreement, unknown versus empty, complete/deferred mappings, approval, bootstrap outcomes, same-clock concurrent edits, local flush and acknowledgment failures, restart, strategy combinations, v4 drain, and operator preview/confirmation. All storage, HOME/XDG directories, sockets and fixture provider ledgers are disposable; inherited `TODU_*` overrides are removed for local verification.

Local receipts do not establish remote disk durability, complete dataset replication, universal cancellation/abort, or resolution of the separately tracked startup-stall issue. No live provider or production storage is part of these tests.
