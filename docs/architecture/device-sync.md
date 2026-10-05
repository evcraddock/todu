# Device Sync and Accounts

## Status

Agreed design from task `task-3436dd34`, following decisions made with Erik during interactive research. Implementation is pending. This document records the agreed behavior, not a claim that the feature is currently available.

[Current architecture](../ARCHITECTURE.md) remains the description of the running implementation until this design is implemented. This task changes documentation only; it does not change dependencies, network exposure, stored data, or runtime behavior.

## Goal

Make a dedicated Automerge sync server optional. Users must be able to synchronize Todu devices without installing or administering a separate service. Existing server-based deployments remain supported.

Synchronization belongs to the daemon. CLI, TUI, and Electron remain local clients; they do not acquire their own persistent Repos or cross-device listeners.

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

## Account and Replica Model

An **account** is a named Todu dataset rooted by a catalog document ID. It is not a login, authenticated identity, or external provider account.

A daemon manages multiple account contexts. Each context has its own persistent Repo and isolated local storage, catalog, registry, synchronization state, and worker policy. Account names are user-facing labels; the catalog ID identifies the dataset.

Joining adds an account rather than replacing the machine's existing account. Separate datasets are not automatically merged. Existing tasks remain accessible by selecting their original account.

Account selection is client-specific. Changing the account in one client does not change another client's selection. Local requests and subscriptions must resolve to an explicit account context; selecting an account does not start or stop synchronization or workers. Clients that do not specify an account retain their existing/default account behavior rather than being silently redirected by another client's selection.

Every enabled account synchronizes in the background regardless of which account a client is viewing. A failure in one account must be reported for that account without making healthy accounts or local daemon access unavailable.

## Replicated Device Registry

Each account's catalog contains one shared device registry, replicated through Automerge. There is no registry server or permanent administrator machine.

Creating an account initializes its registry with the creator's local replica. Migration records an existing local replica using its preserved storage ID. A new joining replica is added only through approval; opening pending account storage must not self-enroll it in the target catalog. Registry initialization and migration are idempotent.

A registry entry identifies an account replica and contains:

- The persistent Automerge Repo storage ID.
- A human-readable device name.
- A listening base endpoint when the device is configured to accept incoming peer connections; otherwise no listening endpoint.

The native storage ID identifies persistent storage, not physical hardware or a cryptographic identity. With separate account Repos, one physical machine can have different storage IDs in different account registries. Todu handles those IDs automatically; users do not copy them during normal enrollment. Connection-level peer IDs are transient routing identities and are not the registry key.

Registry management is available through CLI commands on a local daemon. Enrolled devices can list, update, and remove entries in that account. Devices do not maintain independently authored outbound peer lists: connection targets are derived from the shared registry.

Listener enablement and binding remain local machine settings. A registry edit must not remotely enable a listener or broaden its interfaces. Runtime presence, connection health, and pending enrollment requests are local state, not authoritative liveness fields in the shared registry.

Registry changes propagate eventually. Removal stops intended sharing when a daemon observes the update; it does not instantly update offline machines or erase data already replicated to a removed device.

## Trust and Sharing Boundary

The initial peer feature uses an explicitly trusted, restricted LAN. It uses unencrypted HTTP/WebSocket transport and does not add cryptographic device authentication or pairing. Network access restrictions are the operator's responsibility.

A router can restrict internet reachability; it does not necessarily isolate devices within the LAN. Guest devices, compromised hosts, port forwarding, and other routing arrangements must be considered by the operator. Neither private IP addresses nor announced storage IDs prove identity. A reachable peer can impersonate an identifier; this is not a secure enrollment protocol for untrusted networks.

Todu uses Repo's native `shareConfig` hooks for the operational policy:

- Do not announce account documents to unknown replica IDs.
- Deny document access and incoming document changes from IDs absent from the account's registry.
- Restrict sharing to that account's catalog and referenced document graph, not unrelated cached catalogs or accounts.
- Reevaluate sharing and close affected connections after observing membership removal or a pause.

Both announcement and access checks are required. The older `sharePolicy` controls announcement and must not be mistaken for the access policy. These checks coordinate registered replicas; they do not authenticate the physical machine making a claim.

An explicit optional server connection remains a separately configured replica path, scoped to its account. It must not become a way to expose unrelated account documents. General daemon RPC and approval operations remain on the private local transport.

## Listener and Endpoint Layout

Every daemon supports listening, but its listener is disabled by default. Enabling it requires an explicit bind address. The configurable port defaults to `24377`; there is no default all-interface binding.

One daemon listener serves small HTTP enrollment endpoints and account-specific WebSocket replication paths on the same address and port. It uses Node's HTTP facilities and the existing WebSocket/Automerge adapters, not a separate service, browser application, or required web framework.

Endpoint layout:

```text
http://<bind-address>:<port>/enrollment/requests
http://<bind-address>:<port>/enrollment/requests/<request-id>
ws://<bind-address>:<port>/sync/<catalog-id>
```

The first route accepts enrollment requests. The second reports that request's state and returns join information after approval. The WebSocket path routes to the Repo for that account and preserves the native Automerge replication protocol. It does not expose arbitrary daemon RPC.

There is no public account-listing or remote approval API. Enrollment requests carry validated registration information, not document content. Request state must be bounded, support rejection/expiry and idempotent retries, and avoid publishing arbitrary pending requests into account catalogs.

A new device's user supplies only a base listener endpoint, such as `ws://<host>:24377`; Todu derives the enrollment routes. The existing user explicitly selects the account during approval. The endpoint does not silently change its enrollment target when a client selects another account.

If binding fails because the address is unavailable or the port is occupied, report a listener error. Do not silently bind elsewhere, select another port, or make local account operations unavailable. Account-specific failures must not expose another account as a fallback.

The existing dedicated server retains its configured endpoint and native protocol; it does not need to understand Todu enrollment routes or use port `24377`.

## Enrollment and Serverless Join

The enrollment flow requires one action on the new device and one approval on the receiving device:

1. The new device requests enrollment at a known listening daemon's base endpoint. Todu prepares isolated pending account storage and supplies its native replica ID, name, and listening base endpoint where applicable.
2. The receiving daemon presents a pending request through its local CLI. It does not provide account documents to an unapproved ID.
3. The approving user explicitly selects an account. Denial rejects the request without granting any account.
4. Approval adds the requesting replica to that account's registry and returns the account's catalog ID, account label, source replica information, and account-specific sync endpoint.
5. The new device connects its pending Repo to that account, retrieves and validates the catalog, and automatically adds the account locally. It receives the registry and establishes the remaining eligible connections.
6. Initial full replication continues under that account's status until offline-ready. Enrollment or a connection alone is not a complete-replica claim.

Before it has the registry, the joining Repo uses only the explicitly supplied bootstrap peer and approved catalog scope. It must not bootstrap a fresh catalog when the target is unavailable or accept access to other accounts as a substitute.

The receiving user chooses the account; the request does not need a catalog ID or expose a list of all hosted accounts. Approval applies to that account only. Another enrolled, listening daemon can receive subsequent enrollment requests; the first machine has no permanent privileged role.

Existing accounts and their data are not replaced, merged, or deleted by enrollment. Failures preserve prior working contexts. Retries retain the pending replica's identity and must not create duplicate registry membership or duplicate local account contexts.

## Connection Topology

Connections are derived from each account's registry. Every registered pair that can connect has one bidirectional connection per account:

- If only one replica listens, the outbound-only replica initiates.
- If both listen, the replica with the smaller persistent storage ID in deterministic ordinal string ordering initiates.
- If neither listens, they have no direct connection; an authorized persistent peer can carry changes between them.
- A replica does not connect to itself. Duplicate replica IDs are a configuration/recovery error, not two distinct devices.

For Erik's deployment, Linux and Mac mini listen, and the laptop is outbound-only. The laptop initiates connections to both desktops. The desktops maintain one connection between them. Every connection exchanges changes in both directions, including changes made before it opened.

```text
Linux desktop <--> Mac mini
      ^                 ^
      |                 |
      +---- Laptop -----+

Optional server: an additional connection from each account configured to use it
```

Initial enrollment uses the explicitly supplied bootstrap connection. Once the registry is available, transition to the steady-state initiator rule without overlapping pair connections; enrollment must not produce a second permanent connection.

There is no elected primary or special replication authority. A persistent Repo that has received a document can synchronize it to another authorized peer later, even after the original sender disconnects.

The connection manager owns adapter creation/removal, retry scheduling, endpoint changes, and teardown. It must avoid competing pair connections, stale adapters, leaked listeners/timers, and unhandled errors during sleep, network changes, or shutdown. It uses native adapter behavior where available rather than implementing new replication, routing, merge, or durable-mailbox protocols.

Supported deployments are:

| Deployment | Data exchange and availability |
| --- | --- |
| Existing server-based account, peer feature not enabled | Current server-mediated behavior remains supported. Local work continues during outages; cross-device changes wait for a reachable replication path. |
| Enrolled devices without a server | Reachable peers exchange changes directly. Persistent desktops provide store-and-forward; the sender and eventual recipient do not need to be online simultaneously if another peer received the changes. |
| Enrolled devices with an optional server | Direct links and the server coexist. Server failure does not disable peer links; the server adds another persistent delivery path. |

A direct path can remove an intermediate LAN hop; no latency improvement was measured in this research. Full peer connectivity increases connections and can produce redundant traffic. This design targets small device groups and must be verified at representative sizes rather than promising unbounded mesh scalability.

## Complete Replication and Offline Readiness

Every enabled account keeps a complete local replica of the account's currently referenced document graph, including retained completed/canceled tasks and historical content carried by native document synchronization. There is no project-level selective replication in this design.

The graph follows typed Todu references, not arbitrary strings in user content. It contains the catalog with the added device registry and the reference-bearing data defined by the current [core schemas](../../packages/core/src/schema.ts):

- Existing catalog data.
- `taskListDocIds`, followed by each task list's `detailDocIds` for full descriptions and heavy task content.
- `notesBucketDocIds` and the legacy `notesDocId` while migration requires it.
- `habitLogDocIds`.
- `integrationRegistryDocId`, `integrationStatusDocIds`, and `commentSyncProvenanceDocId` when present.

New references extend replication automatically. Missing or unavailable referenced documents produce incomplete/error status, not empty data or a new substitute document. Schema migrations and future reference-bearing document types must participate in graph traversal.

Offline-ready means all required documents in the locally known graph have been obtained and saved locally. It does not claim knowledge of changes made on an unreachable device. When new references arrive, readiness is reevaluated until their data is available.

The graph coordinator uses Repo's document loading, synchronization, and storage operations. It does not add a second change queue or merge engine. Loading and persistence work must be bounded so one initial account transfer does not monopolize the daemon. Complete copies increase initial transfer, disk, and potentially memory usage; resource behavior needs measurement during implementation.

Local configuration, provider credentials, cursors, and other provider-local runtime internals are not part of the replicated graph. Core-owned integration bindings, status, and comment provenance remain shared data according to the [integration ownership boundary](integrations.md).

## Controls, Status, and Travel

CLI management goes through local daemon RPC. It manages accounts and registry entries and exposes pending requests, explicit account-specific approval/denial, listener settings, and status. A new Electron registry-management UI is not part of the initial scope. Existing clients still need account selection and account-scoped requests/events.

Pause/resume supports one account or the entire daemon:

- Account pause stops that account's peer/server exchange without deleting local data or membership; other accounts continue.
- Daemon-wide pause stops all sync connections and the shared enrollment/sync listener.
- Pause state survives restart. Resume restores configured behavior, not broader bindings or automatically enabled workers.
- Local reads and edits remain available while synchronization is paused.

Report separately:

| Status | Meaning |
| --- | --- |
| Saved locally | Local storage has completed the write. |
| Offline-ready | The locally known required document graph is available and saved. |
| Peer connection state | Connecting, connected, synchronizing, up-to-date with its last reported state, or unreachable. |
| Server connection state | State of an explicitly configured optional server path. |
| Paused | Exchange was intentionally disabled, rather than merely failing to connect. |
| Listener/account error | Actionable failure scoped to the affected component/account. |

Use native heads/sync information and storage events where available. Connected is not fully synchronized. Native synchronization acknowledgments are not proof that another machine's disk has durably persisted every change. Waiting on an offline peer must not prevent local operation or readiness for already obtained data.

The initial peer feature is LAN-only. It does not add internet traversal, port forwarding, VPN integration, or a managed relay. Existing optional server connectivity retains its current behavior.

Users explicitly pause peer synchronization before entering an untrusted network and resume it after returning to a trusted LAN. There is no automatic network-trust inference from private addresses or interface presence. Outbound-only mode avoids accepting incoming connections but does not authenticate the endpoint answering a configured address.

## Automation Ownership

Replicating an account does not make a machine an automation host. Newly joined accounts synchronize only until workers are explicitly enabled/configured for that account and machine.

Existing accounts retain their worker assignments during migration. Account selection does not start or stop workers. Host startup processing that materializes tasks must obey the same execution policy rather than implicitly activating automation when an account context opens.

Provider credentials remain local. Background replication is not permission to inherit another account's local execution settings or run the same external action on every replica. Sync pause controls Automerge transport; worker execution remains governed by its explicit account-local assignments and worker controls. This design does not introduce worker leader election or automatic assignment failover.

## Migration and Recovery

1. Take a restorable backup of existing account data.
2. Preserve the current dataset as the first named account, retaining its catalog ID, data, and existing replica identity. Preserve current server and worker behavior for that account.
3. Keep server synchronization working while participating devices are upgraded and enrolled. Do not depend on older daemons understanding the new account/enrollment/registry model.
4. Verify complete local replicas on at least two devices. For Erik's setup, verify Linux and Mac mini locally; remote connection status alone is not sufficient evidence.
5. Temporarily disable server connections and test direct changes, interrupted sessions, offline edits, returning devices, and later delivery through a persistent peer.
6. Retire the server only after verification and an explicit operator decision. Do not automatically remove its configuration or stored data. Restore its connection if peer operation fails.

A new account must not silently inherit another account's server destination or worker execution settings. Joining enables its agreed peer replication; optional server paths and automation remain explicit account-local configuration.

A synchronized replica is not a backup: unwanted edits also replicate. Preserve separate recovery mechanisms. Restoring data onto another live installation must establish a distinct replica identity rather than cloning one storage ID onto two live peers.

## Stable Dependency and Responsibility Boundary

Only stable releases are permitted. The verified baseline uses Automerge core `3.3.2` and Repo/WebSocket adapters `2.5.6`; this documentation task upgrades neither. Existing implementation is a baseline, not a constraint against later changes using better stable APIs.

| Responsibility | Owner |
| --- | --- |
| Changes, history, concurrent merging, incremental synchronization | Automerge core |
| Persistent documents, peer synchronization, storage and network adapter integration | Automerge Repo and existing adapters |
| Accounts, registry schema, graph references, sharing policy | Todu core/engine |
| Account contexts, enrollment, HTTP/WebSocket routing, connection ownership and lifecycle | Todu daemon with engine helpers |
| Argument parsing, output, approval prompts, and account selection | Local clients |
| Network reachability and trusted-LAN restrictions | Operator/network infrastructure |

No custom CRDT merge, replication protocol, durable mailbox, automatic discovery, cryptographic pairing, or authenticated/encrypted peer transport is introduced. Library limitations and Todu's current single-account/single-remote integration must be handled explicitly and tested; prerelease behavior must not be assumed.

## Implementation Sequence and Verification

Implementation follows these dependent slices of one feature. These are execution deliverables, not independently designed alternatives:

1. **Account contexts and identity:** Isolated persistent Repos, retained existing data, client-specific selection, account-scoped local requests/events, and explicit account/machine worker execution policy. Verify that selecting or joining an account leaves other accounts and worker behavior unaffected.
2. **Registry and complete replicas:** Native storage-ID membership, shared registry management, graph traversal, scoped sharing, and local readiness/storage status. Verify nested task details, notes, habits, integration documents, new references, missing documents, and account isolation.
3. **Listener and enrollment:** Explicit-address HTTP listener, default/configurable port, bounded pending requests, local-only account selection/approval, scoped bootstrap, and native account-specific WebSocket routing. Verify denial, expiry/retry, failed joins, preserved prior data, and no documents for unapproved IDs.
4. **Peer topology and controls:** Registry-derived pair connections, deterministic initiation, optional server coexistence, pause/resume, status, and full lifecycle cleanup. Verify restarts, sleep/network interruptions, removed members, stale endpoints, and failure isolation.
5. **Migration and operational validation:** Existing-server compatibility, upgrade/backup/restore guidance, stable dependency checks, and the deployment scenarios below. Validate before retiring any real server.

Required end-to-end scenarios:

- Serverless desktop/laptop enrollment: two actions, no manual ID transfer, approval for exactly one account, bidirectional data exchange.
- Existing tasks on both machines: joining adds an account; original tasks remain accessible and datasets are not automatically merged.
- Multiple accounts: inactive views continue background sync; selecting one does not change another client; new accounts do not automatically run workers.
- Two always-on desktops plus a laptop: either desktop can serve a returning laptop; changes can be delivered later when the original sender is absent.
- Server-only compatibility and mixed peer/server operation; disabling the server leaves verified direct links working.
- Concurrent edits and new document references arriving through different paths; native convergence and complete local graph availability.
- Laptop travel: persisted pause, local edits while away, explicit resume, and catch-up after returning to the trusted LAN.
- Unknown/removed replica IDs and wrong-account connections: operational sharing denied, without claiming resistance to identifier impersonation.
- Listener disabled, unavailable address, occupied port, and malformed/bounded enrollment input: no silent broader binding or daemon-wide loss of local access.
- Account/daemon pause and restart; clean adapter/listener/timer teardown; no unhandled-rejection or storage-race failures.
- Backup restoration without duplicate live replica IDs, incomplete copies, or loss of access to existing datasets.

## Sources

- [Automerge network synchronization](https://automerge.org/docs/tutorial/network-sync/): persistent peers, multiple adapters, and offline convergence.
- [Automerge sync-server](https://github.com/automerge/automerge-repo-sync-server): persistent server configuration and its stated unsecured deployment model.
- [Repo 2.5.6 storage identity](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/storage/StorageSubsystem.ts): persisted `storage-adapter-id`.
- [Repo 2.5.6 metadata contract](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/network/NetworkAdapterInterface.ts): native `storageId`/`isEphemeral` metadata.
- [Repo 2.5.6 sharing and configuration](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/Repo.ts) and [access checks](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/synchronizer/CollectionSynchronizer.ts).
- [Repo 2.5.6 network routing](https://github.com/automerge/automerge-repo/blob/v2.5.6/packages/automerge-repo/src/network/NetworkSubsystem.ts) and [WebSocket adapters](https://github.com/automerge/automerge-repo/tree/v2.5.6/packages/automerge-repo-network-websocket).
- [Shared HTTP/WebSocket listener examples](https://github.com/websockets/ws#multiple-servers-sharing-a-single-https-server).
