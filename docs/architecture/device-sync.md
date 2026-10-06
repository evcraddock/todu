# Device Sync: Single Dataset and Optional Servers

## Status

Agreed design from research task `task-3436dd34`, revised after Erik approved narrowing the roadmap to one dataset per daemon. Named accounts and account-switching UI are deferred. Erik explicitly selected refusal, not replacement, when a joining installation already has a different dataset.

The replicated device registry foundation is implemented through local daemon RPC and CLI; the remaining roadmap implementation is pending. This document records the revised target behavior, not a claim that LAN synchronization is available. [Current architecture](../ARCHITECTURE.md) remains the runtime baseline. Registry initialization adds dataset-scoped metadata in the existing catalog and local native Repo receipts without changing catalog/storage IDs, configuration, automation assignments, data layout, package dependencies, or network exposure.

## Goal and Scope

Make a dedicated Automerge sync server optional by allowing Todu daemons on a trusted LAN to synchronize directly. Existing server-based deployments remain supported.

One daemon continues to manage one persistent Repo and one dataset rooted by a catalog document ID. CLI, TUI, and Electron remain local clients of that dataset. They do not gain persistent Repos, account selectors, or cross-device listeners. Synchronization operates independently of which client is open or which view it displays.

Deferred tasks retain their future multi-account scope but are not prerequisites of this roadmap:

- `task-6dc2e8be` — Support named accounts through the CLI.
- `task-cb289254` — Switch accounts in Electron.
- `task-ccff8497` — Switch accounts in the TUI.

Multiple active datasets per daemon, automatic dataset merging, and destructive dataset replacement are out of scope. Provider-instance isolation across multiple accounts is also deferred; preserving the current dataset's provider state and safe execution ownership remains required.

## Verified Current Topology

```text
CLI / TUI / Electron --> local daemon --> configured sync server <-- other daemons
```

The current daemon owns one engine instance and catalog context. Its startup calls `createTodu()` with persistent storage and an optional remote server, without enabling the engine's sync-server mode. The engine has a WebSocket server helper, but that helper binds to `127.0.0.1`; its default port is `24377`. It is not a LAN listener enabled by current daemon startup.

The configured server is a persistent Automerge replica, not a master database or conflict-resolution authority. The development deployment uses the standard Automerge sync-server image with a persistent `/data` volume. The upstream server describes its standalone application as unsecured.

Erik's existing deployment uses a LAN-only server. A configured "remote" server means a separate endpoint, not necessarily an internet service. That deployment boundary was confirmed in discussion; no external reachability or router audit was performed.

Existing local data remains usable during a remote connection failure. A document that has never been obtained locally is not available simply because the catalog references it. Current document loading includes on-demand paths, and join validation attaches the configured remote adapter; neither is sufficient for the serverless, complete-replica behavior below.

Verified implementation sources:

- [Daemon ownership, startup, and current join flow](../../packages/daemon/src/runtime.ts)
- [Daemon configuration](../../packages/daemon/src/config.ts) and [remote configuration resolution](../../packages/core/src/config.ts)
- [Engine Repo creation and remote adapter lifecycle](../../packages/engine/src/index.ts)
- [Loopback-only server helper](../../packages/engine/src/sync-server.ts) and [client adapter integration](../../packages/engine/src/sync-client.ts)
- [Persistent storage and catalog markers](../../packages/engine/src/storage.ts)
- [Development server deployment](../../docker-compose.yml)
- [Existing remote failure/reconnection tests](../../packages/engine/src/remote-sync.integration.test.ts)

## Dataset and Replica Identity

The catalog ID identifies the dataset. A persistent native Automerge Repo storage ID identifies a local replica, not physical hardware, a login, or a cryptographic identity. Connection-level peer IDs are transient routing identities and are not the registry key.

Upgrade preserves the existing dataset in place: catalog ID, native storage ID, data directory, configured server behavior, provider-local state, and existing worker assignments. There is no migration into a named-account directory layout.

An existing installation may enroll only as a verified replica of the same catalog. An installation with a different initialized catalog must refuse enrollment without replacing, merging, deleting, or modifying its dataset or settings. An empty task list is not evidence that an installation has no dataset. A pristine installation has no previously initialized live dataset; enrollment must support explicit pending setup before normal catalog bootstrap, rather than creating and then overwriting a throwaway catalog.

Pending enrollment or recovery staging is not another managed account. Failed or unapproved setup must not publish an active catalog, self-enroll, or create substitute data. Existing same-dataset replicas retain their native storage IDs; a restored copy joining alongside its source requires a distinct native replica ID.

## Replicated Device Registry

The existing catalog contains one shared device registry replicated through Automerge. There is no registry server or permanent administrator machine. Entries use typed root-level `device:<native-storage-id>` keys: independently upgrading offline replicas can add different entries without conflicting on creation of a new parent map. Native Automerge merges entry fields; Todu does not implement replication or merge logic.

Current CLI management is documented in [CLI Daemon Usage](../cli-daemon-usage.md#device-registry-management). Names default to the local hostname. Endpoints are optional HTTP(S) base URLs, not enrollment/sync routes. Removed entries retain a replicated removal marker, are hidden from normal listing, and cannot be edited back into membership.

Initialization uses a catalog-keyed local receipt in the native Repo key/value namespace `todu-device-registry`. Established storage is initialized once; pending join validation records a pending receipt before loading, does not migrate the target catalog, and never adds membership. A marker pointing at a catalog not already stored locally is also treated as pending. Restart does not convert pending setup into approved membership. Registry commands can edit only active entries; there is no generic CLI/RPC add operation. The future enrollment task must explicitly approve membership in the selected local catalog; the existing server join command alone is not membership approval.

Registry initialization records an existing local replica using its preserved storage ID and is idempotent. A pristine joining replica is added only through local approval; opening pending storage must not self-enroll it in the source catalog. Existing same-dataset replicas can be enrolled without replacing their local data or identity.

Each entry contains:

- The persistent Automerge Repo storage ID.
- A human-readable device name.
- A listening base endpoint when the device is configured to accept incoming peer connections; otherwise no listening endpoint.

Todu supplies IDs automatically; users do not copy them during normal enrollment. Registry management is available through local daemon RPC and CLI commands. Enrolled devices can list, name, update endpoints, and remove entries. Connection targets derive from this shared registry, not separately maintained peer lists.

Listener enablement and binding remain local machine settings. A registry edit must not remotely enable a listener or broaden its interfaces. Runtime presence, connection health, and pending requests are local state, not authoritative shared liveness fields.

The planned registered-peer sharing controls will stop intended sharing when a daemon observes removal; removal does not instantly update offline machines or erase previously replicated data. This registry foundation alone does not enforce transport access policies, disconnect peers, or change the existing configured server path. Those behaviors belong to the subsequent sharing-restriction and connection-management tasks.

## Trust and Sharing Boundary

The initial peer feature uses an explicitly trusted, restricted LAN with unencrypted HTTP/WebSocket transport. It does not add cryptographic authentication or pairing. Network restrictions are the operator's responsibility.

A router can restrict internet reachability without isolating devices within the LAN. Guest devices, compromised hosts, port forwarding, and routing arrangements must be considered. Private IP addresses and announced storage IDs do not prove identity; reachable peers can impersonate an identifier. This is not secure enrollment for an untrusted network.

Use Repo's native announcement and access policies to:

- Avoid announcing dataset documents to unknown replica IDs.
- Deny document access and incoming changes from IDs absent from the registry.
- Restrict sharing to the current catalog and its typed referenced document graph, excluding unrelated cached catalogs/documents.
- Reevaluate sharing and close affected connections after observed removal or pause.

Both announcement and access checks are required. The older announcement-only `sharePolicy` is not an access policy. These controls coordinate registered replicas; they do not authenticate machines.

An explicitly configured optional server remains a separate replication path scoped to this dataset. Narrow approved bootstrap may temporarily admit only the supplied source and catalog scope. General daemon RPC and approval operations remain private on the local transport.

## Listener and Endpoint Layout

Listening is disabled by default. Enabling it requires an explicit bind address. The configurable port defaults to `24377`; there is no default all-interface binding.

One embedded Node HTTP listener serves bounded enrollment routes and a catalog-scoped native WebSocket path on the same address and port, using existing WebSocket/Automerge adapters:

```text
http://<bind-address>:<port>/enrollment/requests
http://<bind-address>:<port>/enrollment/requests/<request-id>
ws://<bind-address>:<port>/sync/<catalog-id>
```

The WebSocket path accepts only the daemon's current catalog and native replication protocol. A different catalog path is rejected; it never selects a fallback dataset. There is no public dataset-listing API, arbitrary daemon RPC, or remote approval API.

Enrollment requests carry validated registration information, not document content. Request state is bounded, supports rejection/expiry and idempotent retries, and is not published into the catalog while pending. Only a request-scoped polling response may return approved join information.

The requesting user supplies a known base listener endpoint. Todu derives enrollment routes. The receiving user approves the daemon's current dataset through its local CLI; approval identifies that catalog, with no account-selection step.

An unavailable address or occupied port reports a listener error without silent rebinding, port substitution, or loss of local daemon operations. The existing dedicated server keeps its endpoint/native protocol and need not implement enrollment routes or use port `24377`.

## Enrollment and Serverless Join

Enrollment requires one request on the joining device and one approval on a listening device:

1. Explicit enrollment setup establishes that the destination is pristine or an existing replica of the same dataset. A different initialized catalog is refused without mutation. Pristine setup uses pending storage before normal catalog bootstrap.
2. The joining device requests enrollment with its native replica ID, name, and optional listening base endpoint. Pending setup does not activate workers, inherit source-machine configuration, or self-enroll.
3. The receiving daemon presents the request through local CLI. Approval is for its current catalog only; denied, expired, and unapproved requests receive no documents.
4. Approval adds the replica to the shared registry and returns the catalog ID, source replica information, and catalog-scoped sync endpoint. The joining device validates the returned catalog against its local eligibility before attaching to it.
5. A pristine destination retrieves and validates that catalog into its pending Repo before committing it as the sole active dataset. An existing same-dataset replica attaches without resetting its catalog, data, replica identity, server settings, or worker assignments.
6. The replica receives the registry, transitions to steady-state connections, and continues full replication until offline-ready. Enrollment or connection is not a completeness claim.

Before registry availability, the joining Repo uses only the explicit approved bootstrap source and catalog scope. Unavailability does not permit fresh catalog creation or another cached catalog as a substitute. Changed/incorrect targets are refused without modifying an existing dataset. Pending identity survives idempotent retries without duplicate membership or adapter creation. Membership cleanup on a failed/abandoned enrollment must not delete an existing member's entry or data; partial approval and retry behavior must be documented and tested.

Any enrolled listener can receive later requests; the first device has no permanent privileged role. Normal server-based operation remains compatible. Newly enrolled installations do not automatically inherit source server settings or automation policy.

## Connection Topology

For each eligible registered pair, maintain one bidirectional connection:

- If only one replica listens, the outbound-only replica initiates.
- If both listen, the smaller persistent storage ID in deterministic ordinal string ordering initiates.
- If neither listens, an authorized persistent peer can carry changes between them, but there is no direct connection.
- Never connect to self. Duplicate live replica IDs are configuration/recovery errors, not separate devices.

For Erik's deployment, Linux and Mac mini listen, and the laptop is outbound-only:

```text
Linux desktop <--> Mac mini
      ^                 ^
      |                 |
      +---- Laptop -----+

Optional server: an additional explicitly configured replication path
```

The laptop initiates toward both desktops. All connections exchange changes in both directions, including prior offline changes. Transition bootstrap to the steady-state initiator rule without overlapping pair connections.

There is no elected primary. A persistent Repo that received a document can deliver it to another authorized peer later, after the original sender disconnects. The connection manager owns adapters, retry scheduling, endpoint changes, membership removal, sleep/network recovery, and teardown, without stale adapters, leaked resources, or unhandled errors.

| Deployment | Behavior |
| --- | --- |
| Existing server-only installation | Preserve current server-mediated operation; local work continues during server outages. |
| Enrolled devices without a server | Reachable peers exchange changes directly; persistent peers provide later store-and-forward delivery. |
| Enrolled devices with an optional server | Direct links and server coexist; failure or explicit disabling of the server does not stop healthy direct links. |

No latency improvement has been measured. Mesh connectivity can increase connections and redundant traffic; target small device groups and verify resource behavior at representative sizes.

## Complete Replication and Offline Readiness

Keep a complete local replica of the current dataset's referenced document graph, including retained completed/canceled tasks and historical content carried by native synchronization. No project-level selective replication is added.

Follow typed Todu references, not arbitrary strings in content, using the current [core schemas](../../packages/core/src/schema.ts):

- The catalog, including the device registry.
- `taskListDocIds`, followed by each task list's `detailDocIds`.
- `notesBucketDocIds` and legacy `notesDocId` while required for migration.
- `habitLogDocIds`.
- `integrationRegistryDocId`, `integrationStatusDocIds`, and `commentSyncProvenanceDocId` when present.

Continuously fetch newly referenced documents and save complete copies locally. Missing/unavailable documents mean incomplete/error status, never empty results or newly bootstrapped substitutes. Schema migration and future typed references must participate in traversal.

Offline-ready means the locally known required graph is obtained and saved. It does not imply knowledge of edits on unreachable devices or durable persistence on another machine. New references reevaluate readiness. Bound native Repo loading/persistence work so initial transfer does not monopolize local operations; measure transfer, disk, and memory costs.

Local configuration, credentials, provider cursors/checkpoints, item links, mirrored snapshots, tombstones, and retry internals are not replicated graph data. Core integration bindings/status and comment provenance remain shared according to the [integration ownership boundary](integrations.md).

## Controls, Status, and Travel

Local RPC/CLI manages registry entries, pending approval/denial, listener settings, server settings, and status for the sole dataset. There is no account-management API or account-switching UI in this scope; a new Electron device-management UI is not required.

One persisted daemon/dataset pause stops peer/server exchange and the shared enrollment/sync listener. It does not delete data or membership, change worker assignments, or prevent local reads/edits. Resume restores only explicitly configured behavior, without broader bindings or automatically enabled automation.

Report separately:

| Status | Meaning |
| --- | --- |
| Saved locally | Native local storage has completed the write. |
| Offline-ready | The locally known required graph is available and saved. |
| Peer state | Connecting, connected, synchronizing, up-to-date with its last reported state, or unreachable. |
| Optional server state | State of the separately configured server path. |
| Paused | Network exchange was intentionally disabled. |
| Component error | Actionable listener, peer, server, or graph failure without losing local access. |

Connected is not fully synchronized. Use native heads/sync information and storage events; acknowledgments do not prove remote disk durability. An offline peer does not prevent local usability or readiness for already obtained data.

The initial direct-peer feature is LAN-only: no internet traversal, port forwarding, VPN integration, managed relay, or automatic discovery. Existing optional server connectivity retains its supported behavior. Explicitly pause before travel to an untrusted network and resume on return; do not infer network trust from private addresses or interface presence. Outbound-only mode does not authenticate configured endpoints.

## Automation Ownership and Provider State

Replication does not grant permission to execute automation. Pristine enrolled/restored installations synchronize with workers and host startup task-generation processing disabled until the operator explicitly configures execution. Existing installations retain their working assignments and provider-local settings during upgrade and same-dataset enrollment; no source-machine settings are inherited.

A designated execution host runs each integration binding. Other replicas can synchronize/display its data without running it. Enabling listening, approving membership, installing a plugin, or connecting peers must not implicitly start another executor.

Execution ownership is local static configuration with manual handover, not a distributed lease. Stop/disable the previous executor before enabling its replacement and validate the required provider-local state. Offline/unreachable peers and eventually replicated status do not prove an executor stopped. Inconsistent manual configuration can still cause split brain; no leader election or automatic failover is promised.

Provider credentials and mutable runtime internals stay local. Preserve current state paths, links/checkpoints, and supported v3/v4 contracts. State remains scoped to the dataset/catalog and binding, not merely a binding ID from another dataset. Preserve local application/mapping/provenance/flush/acknowledgment ordering without waiting for remote convergence or disk persistence. Do not reimplement provider checkpoint, reconciliation, or note-timestamp work in this roadmap.

Sync pause controls native transport; it does not change worker assignments. Missing/incompatible provider state on recovery blocks automation with actionable instructions, rather than resetting progress and pushing.

## Migration and Recovery

1. Take a restorable independent backup of the existing dataset and, separately, provider-local state where needed.
2. Upgrade in place while preserving catalog ID, native replica identity, server configuration, provider state, and existing worker behavior. No named-account layout migration is required.
3. Keep server synchronization working while devices are upgraded/enrolled. Refuse enrollment of a different initialized dataset without mutation; enroll pristine installations or verified same-dataset replicas only.
4. Verify complete local copies on at least two devices, including Linux and Mac mini for Erik's deployment. Connection status alone is insufficient evidence.
5. Temporarily disable the server and verify direct changes, interruption recovery, offline edits, returning devices, and later delivery through a persistent peer.
6. Retire a real server only after verification and explicit operator approval. Do not automatically remove configuration or storage; retain re-enablement as a fallback.

A synchronized replica is not an independent backup: unwanted edits also replicate. Restoring onto a pristine installation or as recovery of the same dataset must establish a fresh persistent replica identity before rejoining alongside its source. Restoration into a different initialized dataset is refused without overwrite or automatic merge.

Native replicated data is not sufficient to resume an integration. Restore provider-local checkpoints, links, mirrored snapshots, tombstones, and retry state from a validated catalog/binding-scoped backup, or use provider-supported reconciliation. Keep recovered automation blocked until explicit execution assignment and state validation; provision credentials separately. Never infer durable identity from metadata equality, fabricate conflict baselines, discard tombstones, or infer safe failover from eventual status.

## Stable Dependencies and Responsibility Boundary

Only stable releases are permitted. The verified baseline uses Automerge core `3.5.0` and Repo/WebSocket adapters `2.5.6`. Core was upgraded during [dependency security remediation](../security/task-763357bb-dependency-audit.md); Repo and its existing patches were retained. Later stable APIs may be used after verification.

| Responsibility | Owner |
| --- | --- |
| Changes, history, concurrent merging, incremental synchronization | Automerge core |
| Persistent documents, peer synchronization, storage/network adapters | Automerge Repo and existing adapters |
| Registry schema, typed graph references, operational sharing policy | Todu core/engine |
| Enrollment, listener routing, connections, lifecycle, execution policy | Todu daemon with engine helpers |
| Argument parsing, output, local approval prompts | Local clients |
| Trusted-LAN restrictions and network reachability | Operator/network infrastructure |

No custom CRDT merge, replication protocol, durable mailbox, account framework, authenticated/encrypted transport, or prerelease-dependent behavior is introduced.

## Task Sequence and Dependencies

The three foundation tasks have no named-account dependency and can be prepared independently:

| Task | Deliverable | Dependencies |
| --- | --- | --- |
| `task-d8c0f604` | Replicated device registry | None |
| `task-43b0e045` | Complete offline dataset replicas | None |
| `task-c5349136` | Explicit automation execution ownership | None |
| `task-dd563aa1` | Registered-peer and catalog-graph sharing restrictions | Registry and complete replicas |
| `task-97451918` | Opt-in explicit-bind LAN listener | Sharing restrictions |
| `task-4e23e7e3` | Local approval and safe same-dataset/pristine enrollment | Automation ownership and listener |
| `task-b8e0cfb5` | Automatic registry-derived peer connections | Enrollment |
| `task-e0d9e744` | Optional server management alongside direct peers | Automatic peer connections |
| `task-75b82848` | Persisted dataset/daemon sync pause and resume | Peer connections and optional servers |
| `task-8cc052e1` | Truthful dataset synchronization status | Complete replicas, peer connections, optional servers, pause/resume |
| `task-fe7f362e` | Distinct-replica recovery and rollout runbook | Enrollment and synchronization status |

## Required End-to-End Verification

- Pristine desktop/laptop enrollment: one request and one local approval, no manual ID transfer, bidirectional native exchange, automation initially disabled.
- Existing same-dataset replicas: preserve data, catalog/native IDs, server configuration, and existing execution behavior during enrollment.
- Different initialized datasets, including empty task lists: refuse enrollment/restoration without changes to data, IDs, settings, provider state, or automation.
- Denied, expired, wrong-catalog, and unapproved requests receive no documents; failed/retried enrollment does not create substitutes, duplicate membership, or unintended deletion.
- Two persistent desktops plus a laptop: either desktop serves a returning laptop; later delivery works after the original sender disconnects.
- Server-only compatibility, serverless operation, and mixed paths; disabling/losing the server leaves healthy direct links working.
- Concurrent/offline edits and new typed document references; native convergence and complete locally saved graph availability.
- Trusted-LAN travel workflow: persisted pause, local edits while away, explicit resume/catch-up without changed bindings or worker assignments.
- Unknown/removed IDs and unrelated catalog paths: intended sharing denied without claiming resistance to impersonation or remote data deletion.
- Listener disabled, unavailable address, occupied port, and malformed/bounded requests: no silent broader binding or loss of local RPC.
- Restart/shutdown: clean adapters/listeners/timers, no unhandled rejections or storage races, local work unaffected by unreachable paths.
- Execution handover/recovery: distinct replica identity, validated provider-local state, explicit credentials/assignment, no silent progress reset, tombstone loss, or duplicate executor activation.

## Sources

- [Automerge network synchronization](https://automerge.org/docs/tutorial/network-sync/): persistent peers, multiple adapters, and offline convergence.
- [Automerge sync-server](https://github.com/automerge/automerge-repo-sync-server): persistent server configuration and its stated unsecured deployment model.
- [Repo 2.5.6 storage identity](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/storage/StorageSubsystem.ts): persisted `storage-adapter-id`.
- [Repo 2.5.6 metadata](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/network/NetworkAdapterInterface.ts): native `storageId`/`isEphemeral`.
- [Repo 2.5.6 sharing configuration](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/Repo.ts) and [access checks](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/synchronizer/CollectionSynchronizer.ts).
- [Repo network routing](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/network/NetworkSubsystem.ts) and [WebSocket adapters](https://github.com/automerge/automerge-repo/tree/v2.5.6/packages/automerge-repo-network-websocket).
- [Shared HTTP/WebSocket listener examples](https://github.com/websockets/ws#multiple-servers-sharing-a-single-https-server).
- [Approved Forgejo issue-sync decisions](https://github.com/evcraddock/todu-forgejo-plugin/blob/main/docs/ISSUE-SYNC-RESEARCH.md): provider checkpoint, snapshot, deletion, and recovery boundaries.
