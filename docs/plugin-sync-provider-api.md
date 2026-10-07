# SyncProvider API (Plugin Author Guide)

This document defines the external sync plugin contract exported by `@todu/core`.

For generic daemon worker plugins, see `docs/worker-plugin-api.md`.

## Purpose

`SyncProvider` is the runtime contract for plugins that synchronize todu data with external systems such as GitHub or Forgejo.

This document defines the provider execution contract. Shared integration binding desired state is a separate architecture concern owned by core and documented in `docs/architecture/integrations.md`.

Core-owned imported-content approval metadata also remains outside provider-managed state. Task description approval metadata lives with `TaskDetailDocument`, note/comment approval metadata lives with `Note`, and the host/runtime is responsible for deriving approval from binding identity, actor identity, and content fingerprint.

## Relationship to generic integration architecture

Provider plugins should not own the canonical cross-device integration binding registry for projects and external targets.

Instead:

- core owns the synced integration binding model
- the daemon/plugin host enumerates applicable integration bindings for a provider
- the provider executes sync work for integration bindings supplied by the host
- provider runtime internals remain local to the authority daemon host

Use local provider configuration for secrets and host-local runtime settings, not for synced integration binding desired state.

## Compatibility policy

Compatibility is API-version based.

- Latest provider API version: `SYNC_PROVIDER_API_VERSION` (currently `5`).
- Host-supported provider API versions: `SYNC_PROVIDER_SUPPORTED_API_VERSIONS` (currently `3`, `4`, and `5`).
- Every provider manifest must declare `apiVersion`.
- Providers are loadable only when `manifest.apiVersion` is included in the host-supported version set.
- Unsupported versions must fail closed at load time.
- Provider API v2 compatibility has been removed.
- API v5 enables independent task field-group reconciliation and winning-value acknowledgments (`SYNC_PROVIDER_API_VERSION_V5`). V3/V4 providers must keep their explicit version declarations to retain their existing behavior; using the latest-version constant is an explicit opt-in to the latest contract.

Use `validateSyncProviderRegistration(...)` during plugin load to enforce this gate.

## Manifest contract

```ts
interface SyncProviderManifest {
  name: string;
  version: string;
  apiVersion: number;
}
```

Rules:

- `name` must be non-empty.
- `version` must be non-empty.
- `apiVersion` must be a positive integer and API-compatible with host runtime.

## API v5: field-group task reconciliation

The daemon implements this lifecycle for explicitly registered v5 providers. V3/V4 payloads, whole-task conflict behavior, and acknowledgment signatures remain unchanged. `validateSyncProviderRegistration` accepts v3/v4/v5 by default; an explicit `supportedApiVersions` override can restrict compatibility. A v4 registration exposing v5-shaped data does not opt into field-group processing.

v5 inherits initialization, shutdown, push, comments, and opaque checkpoints from v4. It replaces the pull result and acknowledgment signature:

```ts
interface SyncProviderPullResultV5 extends SyncProviderPullResultV4 {
  taskUpdates: SyncTaskFieldGroupUpdate[];
}

interface SyncProviderV5 extends Omit<SyncProviderV4, "pull" | "acknowledgePull"> {
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResultV5>;
  acknowledgePull(
    binding: IntegrationBinding,
    checkpoint: unknown,
    project: Project,
    acknowledgment: SyncProviderPullAcknowledgmentV5,
  ): Promise<void>;
}
```

### Independent normalized groups

| Group | Complete value | Equality |
| --- | --- | --- |
| `content` | `{ title: string, description: string }` | Exact title/body strings; preserve markdown |
| `workflow` | `{ status: TaskStatus }` | Normalized Todu status |
| `classification` | `{ priority: TaskPriority, labels: string[] }` | Equal priority and label sets; order is irrelevant |
| `assignment` | `{ assignees: SyncAssigneeIdentity[] }` | Equal stable external identity sets; order is irrelevant |

A `SyncAssigneeIdentity` requires a non-empty `externalAccountId` or `externalLogin`. Prefer stable account IDs and use binding-local mappings to reconcile login aliases; do not compare display names, raw metadata, or emit local actor IDs. Providers normalize remote values and mirrored bases consistently. The host projects local actor assignments into the same identity space; incomplete mappings must never be treated as an empty or partial complete set.

Each supplied group contains `base` (the last normalized value successfully mirrored on both sides), `remote` (the current normalized remote value), and optional `sourceTimestamp` (the source update clock). A missing base is invalid: do not invent an empty base. Establish an initial mirrored snapshot only after acknowledged bootstrap and verification that the persisted local/exported value equals the remote value, or after independently verifying equality. Bootstrap acknowledgment alone does not return per-group winning values.

Content strings use the engine's existing outer-whitespace trimming convention and task title/body size limits. Providers must supply already-normalized values; v5 rejects noncanonical or oversized content rather than trimming/truncating it and falsely acknowledging a different mirrored value. Internal markdown is unchanged.

Omit a whole group to leave it unchanged; within a supplied group, every field is required. A missing description is not a clear: normalize a deliberately absent body to `description: ""`. Empty label/assignee arrays explicitly clear those sets. Unknown groups, undefined groups, invalid statuses/priorities, partial values, and malformed timestamps fail validation. `validateSyncTaskFieldGroupUpdate(unknown)` returns a `Result` with a contextual field error; it validates shape only, not durable identity, actor authorization, or business policy.

### Identity and bootstrap

An update requires canonical `externalId`, scoped to the binding/project supplied to `pull`. Optional branded `localTaskId` is an assertion, not permission to relink: the host must verify it agrees with the existing durable link and project. Missing, ambiguous, or contradictory identity fails the batch without acknowledgment; title equality is not identity.

`tasks` is retained for bootstrap creates of unlinked records and replay of interrupted bootstrap. An existing bootstrap identity is accepted only with an explicit remote `updatedAt` no newer than the current local clock; equal-timestamp detail repair retains v4 replay behavior, and newer local data is preserved. Newer whole-task replacements or existing identities without a replay clock are rejected. Incremental updates to linked tasks use `taskUpdates`. A batch must not repeat the same identity in either array or include it in both. `taskUpdates` is required even for empty pulls (`[]`). Unlinked bootstrap keeps the inherited v4 import rules, and the first group base requires successful acknowledgment plus verified local/remote equality. Comments retain v4 behavior; comment reconciliation, hard deletion, provider-specific mappings, and exact per-group clocks are outside this extension.

### Three-way decision rules

Compare the local and remote normalized group values against `base` before consulting clocks:

| Local changed | Remote changed | Relationship | Resolution | Winner | Remote write required |
| --- | --- | --- | --- | --- | --- |
| No | No | Both equal base | `unchanged` | `equal` | No |
| Yes | No | Different values | `local-only` | `local` | Yes |
| No | Yes | Different values | `remote-only` | `remote` | No |
| Yes | Yes | Equal new values | `converged` | `equal` | No |
| Yes | Yes | Different new values | `conflict` | Newer timestamp, otherwise remote | Only if local wins |

For true conflicts, compare timestamp instants, not ISO strings. Source timestamps must be valid RFC 3339 with timezone; omit a missing clock, rather than sending null or an invalid string. Local clocks are host-owned. The initial host may use the task-level `updatedAt` and providers may use record-level clocks; those clocks select a deterministic winner but do not prove which individual group changed last. Equal instants (including different timezone spellings) or either missing clock always select remote. Invalid supplied clocks fail the batch, not the tie fallback.

Every true conflict has a `SyncTaskFieldGroupConflict` containing binding ID, local task ID, external ID, group, available local/remote timestamps, and the selection reason (`newer-timestamp`, `remote-wins-equal-timestamps`, or `remote-wins-missing-timestamp`). Its enclosing outcome carries the selected winner and winning value. Local-wins outcomes can only use `newer-timestamp`; conflict outcomes require diagnostic data. One-sided and equal-value changes are not conflicts and do not use timestamps to veto changes.

Assignment replacement is deferred when the host cannot project the complete local set through authorized binding mappings. Return `deferred: { assignment: "incomplete-assignment-mapping" }`, omit the assignment outcome, preserve remote assignment and its mirrored base, and emit a warning. Other groups can still reconcile. A complete, intentionally empty mapped set is a valid clear. Providers must not interpret an omitted/deferred outcome as permission to write a partial exported assignee set.

### Application, acknowledgment, and snapshot ordering

For v5, the daemon performs:

1. Pull normalized bootstrap tasks, comments, field-group updates, and a proposed opaque checkpoint; validate the entire batch and resolve existing-task identities.
2. Read current local values and reconcile each supplied group independently. Apply only selected remote changes through normal task validation, actor authorization, and imported-content approval paths. Preserve omitted groups. Produce exactly one task result per update, in input order, with outcomes for supplied groups or the explicit assignment deferral.
3. Apply v5 task changes through an engine-local current-state precondition: after asynchronous document loading, compare the complete observed task values, approval state, identity, and clock before either document is mutated. There are no awaits between the check and mutations, and guarded writes preserve the observed clock instead of replacing it. An intervening local edit fails the cycle before application; the next retry reconciles fresh state. Bootstrap detail repairs and transport links use the same guard. Persist tasks/comments, provenance, and binding actor mappings. Await the native local storage flush barrier, as in v4. Re-read each winning group and fail acknowledgment if an intervening edit or read failure means its value no longer matches the receipt.
4. Call `acknowledgePull(binding, checkpoint, project, { taskResults })`, including `{ taskResults: [] }` for empty pulls. No acknowledgment is sent on validation, application, mapping-persistence, or flush failure.
5. Only after acknowledgment succeeds, rebuild current exports and push for bidirectional bindings. Push-only/`none` bindings do not receive pull acknowledgment.

`SyncTaskFieldGroupResult` includes the verified `externalId`, branded `localTaskId`, and a partial map of group outcomes. Each outcome includes the selected `value`, `resolution`, `winner`, and `remoteWriteRequired`; conflicts also include diagnostics. The acknowledgment is a receipt of locally persisted application, **not** confirmation of a remote write or peer convergence.

For outcomes with `remoteWriteRequired: false`, the provider may commit the acknowledged value as its mirrored base. For local-wins outcomes, keep the previous base and durably stage the selected value for remote push; advance that group's base only after the remote write succeeds. Pull-only bindings must retain the previous base for local wins because no push follows. Deferred/omitted groups never advance their base. Retain deferred assignment reconciliation independently of the pull cursor and retry it with fresh remote values when mappings become complete. A provider that completes a read checkpoint while remote writes are pending must retain those writes independently of the pull cursor so they survive push failures and restart.

A provider's v5 push must use staged group decisions rather than blindly replacing whole exported tasks. Recheck fresh export values against staged values before writing, so intervening local edits are not lost. Advance snapshots only to values actually confirmed on both sides; provider-side remote write success, not inherited `taskLinks`, establishes remote completion. Partial remote success advances only confirmed groups; failures retain the remaining pending work.

### Interrupted content application recovery

Title metadata and body details reside in separate Automerge documents. Before applying a selected remote content value, the engine atomically saves a bounded host-local recovery record under `sync-content-recovery/`, keyed by catalog and binding identity, with the task identity, before/selected values, preserved local clock, and source clock. Files use private permissions and are not replicated or exposed through daemon RPC. This is unfinished host application intent, **not** provider cursors or mirrored snapshots.

Remote application preserves the checked current local task clock so one group does not manufacture a later local edit for another group's conflict decision. A stale reconciliation snapshot is a failed precondition, never permission to restore an older clock. The engine also checks values, so same-millisecond local edits cannot bypass the guard. On retry/restart, the host reads fresh content and identity. It completes an interrupted content write only when the task clock is unchanged and both content components still match the recorded before/selected alternatives. It then reconciles the newly pulled remote value using the recovered source clock, so a newer remote edit is not replaced by a cached outcome. A distinct newer local content edit is reconciled normally and is never repaired back to the older value. A mixed partial value with an intervening clock change has ambiguous provenance and fails closed for explicit content resolution, rather than silently overwriting an edit or acknowledging incomplete content. No exact per-group clocks or cross-document transactions are introduced.

Recovery records remain after application, mapping persistence, flush, or acknowledgment failure and are removed only after successful acknowledgment. Corrupt/unreadable records and storage write failures fail the binding safely. A failed cleanup after acknowledgment is reported and skips push; the committed provider read checkpoint is not rolled back. Fresh v5 push detail/comment read failures also skip push instead of using legacy empty-content fallbacks. Ephemeral engines keep recovery in memory; persistent daemon engines retain it across restart. Duplicate worker ownership is not solved by this record.

Keep acknowledgment idempotent and replay-safe as in v4. The provider stages progress before acknowledgment and commits only the supplied binding/checkpoint; a successful commit followed by a callback error or crash must not discard pending remote writes. If application partially succeeded before failure, the next pull replays against fresh local values and the unchanged mirrored base. Do not cache a stale host outcome as a substitute for replay. Already-applied changes are not rolled back.

### Example: independent title and status edits

```ts
const update: SyncTaskFieldGroupUpdate = {
  externalId: "tracker/project/123",
  groups: {
    content: {
      base: { title: "Original", description: "Body" },
      remote: { title: "Original", description: "Body" },
      sourceTimestamp: "2026-06-01T12:00:00Z",
    },
    workflow: {
      base: { status: "active" },
      remote: { status: "done" },
      sourceTimestamp: "2026-06-01T12:00:00Z",
    },
  },
};
```

If the current local title is `Renamed` and status is still `active`, the content outcome is `{ value: { title: "Renamed", description: "Body" }, resolution: "local-only", winner: "local", remoteWriteRequired: true }`. The workflow outcome is `{ value: { status: "done" }, resolution: "remote-only", winner: "remote", remoteWriteRequired: false }`. Classification and assignment stay untouched. After local flush, acknowledgment permits committing the workflow snapshot, but the content snapshot stays at `Original` until the provider successfully pushes `Renamed`.

## API v4: acknowledged pull checkpoints

API v4 extends the v3 task/comment payload and push contract with an opaque checkpoint and a required acknowledgment callback:

```ts
interface SyncProviderPullResultV4 extends SyncProviderPullResultV3 {
  checkpoint: unknown;
}

interface SyncProviderV4 extends SyncProviderV3 {
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResultV4>;
  acknowledgePull(binding: IntegrationBinding, checkpoint: unknown, project: Project): Promise<void>;
}
```

Register v4 providers with `SyncProviderRegistrationV4` and `SYNC_PROVIDER_API_VERSION_V4`. The host validates that `acknowledgePull` exists before loading the provider. Every v4 pull result must contain its own `checkpoint` property, including empty pulls; `null` is a valid opaque value. The host passes the checkpoint back unchanged, without interpreting, replicating, or storing it.

### Application and acknowledgment ordering

For each pull-enabled binding, the daemon performs:

1. Call `pull(binding, project)` to obtain normalized records and a proposed checkpoint.
2. Apply tasks, comments, deletions, complete comment snapshots, actor authorization, and comment provenance.
3. Persist any imported actor mappings on that binding.
4. Await the engine's native `Repo.flush()` local storage barrier.
5. Await `acknowledgePull(binding, checkpoint, project)`.
6. For bidirectional bindings, build the current export payload and run push.
7. Record successful binding status only after all required operations finish.

Empty pulls still flush and receive acknowledgment: an empty remote window may represent valid progress. Push-only and `none` bindings never receive pull acknowledgments. Local persistence does not mean peer convergence or remote disk persistence, and the host does not wait for remote peers. The barrier has the native storage adapter's guarantees; it does not introduce transactions across documents or an additional filesystem durability protocol.

### Provider responsibilities and retry contract

- Keep read checkpoints separate from write success. Push must never advance a pull cursor.
- `pull` may propose progress but must not durably advance cursors or mirrored snapshots that would prevent replay before acknowledgment. Stage that progress in provider-local state; the opaque checkpoint can identify the staged batch.
- Commit progress in `acknowledgePull`, only for the supplied binding and checkpoint. Make the commit idempotent and safe if it succeeds but the callback subsequently rejects or the process exits before the host observes success.
- Preserve stable external task/comment identities and timestamps. If acknowledgment has not succeeded, the next pull must replay the uncommitted window, including after daemon/provider restart. The host does not retain an in-memory checkpoint across restarts or invoke the old callback without pulling again.
- Ensure an acknowledgment does not advance beyond records actually returned or safely observed. Provider-specific cursor boundaries, overlap, and partial remote-fetch behavior remain the provider's responsibility.

Task or comment application, provenance, mapping, and local flush failures prevent acknowledgment and skip push. Acknowledgment failures also skip push and enter the existing retry/backoff path. Already-applied local changes are not rolled back. Tasks are replayed by external ID. For equal-timestamp v4 replays, the host reads the separate task detail document and repairs a differing imported description before acknowledgment; a task-list timestamp alone does not prove its detail was persisted. Genuinely newer local tasks remain authoritative, matching content is not rewritten or reapproved, and v3 keeps its equal-timestamp skip behavior. Imported notes use stable binding/thread/comment-scoped IDs so a note whose provenance write failed can be recovered without a duplicate. Existing provenance and legacy linked notes retain their identities. Failed note reads are errors, not empty snapshots. In v4, comments, tombstones, or complete snapshots referencing tasks unavailable locally fail the pull instead of being silently skipped and acknowledged; providers must omit deliberately excluded threads from checkpointed batches.

If push fails after a successful acknowledgment, the acknowledged pull remains committed: push failure does not undo applied local data or rewind the read checkpoint. Integration status is diagnostic, not the provider's checkpoint ledger.

### v3 compatibility

API v3 remains supported with its original pull/push lifecycle and no host acknowledgment or new flush requirement. Legacy providers should declare `SYNC_PROVIDER_API_VERSION_V3` explicitly; the unversioned latest-version constant now advertises v5. V4 providers should likewise declare `SYNC_PROVIDER_API_VERSION_V4` explicitly. A callback or checkpoint on a v3 registration does not opt it into v4 behavior. Registration must explicitly declare v4 to use acknowledged checkpoints. v2 remains unsupported. Existing v3 providers do not gain checkpoint safety until they adopt v4.

## API v3 shared payload contract

API v3 defines the shared task/comment payloads retained by v4.

```ts
interface ExternalActorRef {
  externalAccountId?: string;
  externalLogin?: string;
  displayName?: string;
  raw?: unknown;
}

interface ImportedTaskInput {
  externalId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  assignees?: ExternalActorRef[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

interface ImportedCommentInput {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: ExternalActorRef;
  createdAt: string;
  updatedAt?: string;
  raw?: unknown;
}

interface DeletedImportedCommentInput {
  externalId: string;
  externalTaskId: string;
  deletedAt?: string;
  raw?: unknown;
}

interface SyncProviderPullResultV3 {
  tasks: ImportedTaskInput[];
  comments?: ImportedCommentInput[];
  deletedComments?: DeletedImportedCommentInput[];
  completeCommentExternalTaskIds?: string[];
}

interface CommentSyncProvenance {
  bindingId: IntegrationBindingId;
  provider: string;
  targetKind: string;
  targetRef: string;
  localNoteId: NoteId;
  externalTaskId: string;
  externalCommentId: string;
  sourceUrl?: string;
  lastMirroredAt: string;
}

interface ExportedCommentInput {
  localNoteId: NoteId;
  body: string;
  createdAt: string;
  updatedAt?: string;
  sourceUrl?: string;
  provenance?: CommentSyncProvenance;
  /** @deprecated Use provenance.externalCommentId. */
  externalId?: string;
}

interface ExportedTaskInput {
  localTaskId: TaskId;
  externalId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  assignees: ExternalActorRef[];
  sourceUrl?: string;
  updatedAt: string;
  comments: ExportedCommentInput[];
}

interface SyncProviderV3 {
  readonly name: string;
  readonly version: string;
  initialize(config: SyncProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResultV3>;
  push(binding: IntegrationBinding, tasks: ExportedTaskInput[], project: Project): Promise<SyncProviderPushResult>;
}
```

### v3 boundary rules

- Providers must not consume or emit local `ActorId` values.
- Providers own external identity extraction only.
- The host/runtime owns local actor resolution, mapping persistence, and imported-content approval computation.
- `binding.options.actorMappings` is shared desired state, not provider-local runtime bookkeeping.
- Provider-local secrets, cursors, caches, and linkage internals remain outside synced core entities.

## Expected lifecycle

1. Load plugin module.
2. Validate registration and compatibility.
3. Call `initialize(...)` once before binding-driven sync operations.
4. For each applicable integration binding, call `pull(...)` and `push(...)` according to the binding strategy; v4 inserts local application/persistence and `acknowledgePull(...)` before push.
5. Call `shutdown()` during daemon stop/unload after any in-flight cycle finishes.

## Task and comment sync semantics

### Pull behavior

`SyncProviderPullResultV3.tasks` accepts `ImportedTaskInput[]`. `comments` accepts `ImportedCommentInput[]` and is treated as an upsert/import batch. Comment pulls are partial/incremental by default; omitted comments are unchanged unless the provider also supplies explicit deletion metadata.

In v3:

- providers return normalized external identity data with `ExternalActorRef`
- providers do not translate directly into local tasks or notes
- the host/runtime is responsible for actor creation/reuse, binding mapping updates, and approval-state computation

Imported timestamp semantics:

- newly created local tasks preserve external `createdAt` when provided
- newly created local tasks preserve external `updatedAt` when provided
- if only one external task timestamp is provided, the runtime uses that timestamp for both local `createdAt` and `updatedAt`
- later pull updates preserve local `createdAt` and use external update timestamps for conflict resolution
- invalid timestamps fail the pull safely instead of being written into local task state

### Push path

`push(...)` must return a `SyncProviderPushResult`:

```ts
interface SyncProviderPushCommentLink {
  localNoteId: NoteId;
  externalCommentId: string;
  externalTaskId: string;
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

interface SyncProviderPushTaskLink {
  localTaskId: TaskId;
  externalId: string;
  sourceUrl?: string;
}

interface SyncProviderPushResult {
  commentLinks: SyncProviderPushCommentLink[];
  taskLinks: SyncProviderPushTaskLink[];
}
```

The runtime applies returned `taskLinks` first, writing back task linkage for pushed local tasks so later pull cycles deduplicate by `externalId`. Returning the same task link again is a no-op. Returning a conflicting task link for a task that is already linked to a different external item is treated as a runtime error.

The runtime then applies each returned comment link idempotently by writing structured comment provenance for the referenced local note and integration binding. Returning the same link again is a no-op. Returning a conflicting link for a note that is already linked to a different external comment is treated as a runtime error. During rollout, the runtime may preserve legacy `sync:externalId:<externalCommentId>` tags for local-origin comment links so older providers keep working, but providers should migrate to `ExportedCommentInput.provenance` and stop reading note tags.

### Comment pull path

Pulled comments are `ImportedCommentInput[]` with structured `author?: ExternalActorRef`. The runtime treats this array as a partial upsert batch unless the provider opts into deletion semantics.

The runtime reconciles pulled comments with local notes using a partial-by-default model:

- comments with an `externalId` not present locally are created as new notes and linked through structured comment provenance, not user-visible tags
- comments matching an existing local note are updated if the external `updatedAt` is newer than the local `createdAt`
- local synced notes whose external IDs are absent from a partial pull are preserved
- local synced notes are deleted only when their external ID appears in `deletedComments`, or when their `externalTaskId` appears in `completeCommentExternalTaskIds` and their external ID is absent from the complete comment snapshot for that task/thread
- existing notes with legacy `sync:externalId:*` tags are resolved lazily into provenance records when encountered; notes without sync tags are not rewritten by this migration

### Comment provenance migration path

Comment provenance is core-owned sync bookkeeping keyed by local note ID and integration binding. It stores the binding/provider target context, local note ID, external task/thread ID, external comment ID, optional source URL, and last mirrored timestamp. New providers should use `comment.provenance?.externalCommentId` to decide whether to skip, create, update, or delete remote comments. Existing GitHub/Forgejo-style providers that previously called `note list` and inspected `sync:externalId:*` tags can migrate by reading `ExportedTaskInput.comments[].provenance` from the push payload instead; `comment.externalId` is a temporary compatibility alias for `comment.provenance.externalCommentId`.

## Load-time enforcement

At plugin load time, call:

```ts
validateSyncProviderRegistration(registration)
```

Validation enforces:

- manifest shape and non-empty identity fields
- required provider lifecycle methods for the declared API version
- provider/manifest identity consistency (`name` + `version`)
- API-version compatibility against the host-supported version set

Validation errors use structured codes:

- `INVALID_MANIFEST`
- `INVALID_PROVIDER`
- `API_VERSION_MISMATCH`
- `IDENTITY_MISMATCH`

## Daemon host configuration

Daemon plugin host loads sync plugin modules from configured local module paths.

Resolution order:

1. `TODU_DAEMON_PLUGIN_PATHS` env var (comma-separated module paths)
2. `daemon.plugins.paths` in the config file (absolute and dot-relative entries are filesystem paths; other entries are npm package specifiers)

Runtime behavior:

- Plugin loading occurs at daemon startup.
- Path/config changes apply on daemon restart.
- Duplicate path entries are tolerated and logged; first occurrence wins.

Per-plugin scheduler config can be provided via `daemon.plugins.config.<pluginName>` in config file or `TODU_DAEMON_PLUGIN_CONFIG` (JSON object). Supported fields:

- `intervalSeconds`: steady-state cycle interval
- `retryInitialSeconds` / `retryMaxSeconds`: retry backoff controls
- `enabled`: optional execution toggle for the local provider worker
- `settings`: provider-specific object passed to `initialize(...)`

Binding desired state is no longer configured through local plugin config. The daemon host enumerates shared integration bindings from core state, filters by provider name and `enabled` state, and executes provider work according to each binding's `strategy`, `projectId`, `targetKind`, `targetRef`, and optional `options` object.

Architecture note: the generic integration direction in `docs/architecture/integrations.md` moves project-to-external integration binding desired state into synced core data. In that model, local provider config remains the place for secrets, credentials, retry tuning, and other host-local runtime settings. `binding.options` is for provider-specific desired-state configuration only and must not be used for secrets or runtime internals.

Retry policy:

- pull/push cycle failures are logged and retried with exponential backoff
- delay formula is `retryInitialSeconds * 2^attempt`, capped by `retryMaxSeconds`
- retry state resets after a successful cycle
- daemon shutdown stops further scheduling and calls provider `shutdown()`

## Conflict resolution baseline

The implemented v3/v4 provider sync conflict resolution baseline is whole-task `last-write-wins` based on `updatedAt` timestamps. Providers should preserve external timestamps where available and provide deterministic mapping behavior under repeated pull/push runs. Explicit v5 registrations use the independent three-way field-group reconciliation described above, without altering legacy v3/v4 behavior.
