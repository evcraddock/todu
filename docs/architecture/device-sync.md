# Device Sync: Single Dataset and Optional Servers

## Status

The replicated device registry, opt-in LAN listener, local approval-based enrollment, and roster-derived connections at startup or explicit reload are implemented. There is no background roster reconciliation. This document supersedes the earlier roadmap's registry authorization, complete-offline-replica, and automation-ownership proposals, which were cancelled after reviewing the existing implementation and native Automerge behavior.

[Current architecture](../ARCHITECTURE.md) remains the runtime reference. Enabling a listener does not make an existing deployment automatically serverless: another peer must establish a native connection to it. No listener is enabled by upgrading or editing a registry endpoint.

## Goal and Scope

Make a dedicated Automerge sync server optional by allowing equal Todu peers on a trusted LAN to synchronize directly. A listening daemon is not a master, account server, or replacement central service. Existing server-based deployments remain supported.

One daemon owns one persistent Repo and one dataset rooted by its catalog document ID. CLI, TUI, and Electron remain local clients; they do not gain persistent Repos, account selectors, or LAN listeners. Multiple active datasets, automatic dataset merging, destructive replacement, internet traversal, and automatic discovery are out of scope.

## Native Automerge Responsibilities

Automerge supplies document transfer, bidirectional synchronization, concurrent merging, and persistent local storage. Todu supplies listener lifecycle and endpoint selection; it does not implement another replication protocol or merge layer.

A persistent Repo saves local and received documents, including documents not displayed in the UI. `repo.find(id)` reuses a local document or requests that same ID from a connected peer. Receiving a catalog reference is not automatic recursive traversal of its entire document graph. Existing typed references and normal document-loading paths remain in use; this feature does not preload every historical document or claim complete offline readiness.

Native peers can deliver documents they previously received after the original sender disconnects. There is no elected primary. Neither a connection nor local persistence establishes that every document is present or that another machine has durably saved it.

## Dataset and Replica Identity

The catalog ID identifies the dataset. A persistent native Automerge Repo storage ID identifies a replica, not physical hardware, a user account, or a cryptographically authenticated machine. Connection peer IDs are transient routing identities and are not registry keys.

Listener enablement preserves the catalog and storage IDs, data directory, configured server, local provider settings/state, and automation assignments. There is no migration into another data layout and no dataset creation or replacement as part of binding a listener.

Managed enrollment refuses a different initialized dataset without replacement or merging, even when it contains no tasks. A pristine installation explicitly prepares pending storage before normal catalog bootstrap; it never creates and overwrites a throwaway dataset. Native identity initialization is serialized so the persisted ID, registry ID, and announced native storage ID agree.

## Replicated Device Registry

The existing catalog contains a shared device roster. Entries use root-level `device:<native-storage-id>` keys so replicas initialized independently can add entries without conflicting on creation of a parent map. Native Automerge handles convergence.

Each active entry contains:

- The persistent native storage ID.
- A readable device name, initially the local hostname.
- An optional HTTP(S) listening base endpoint.

[Local registry commands](../cli-daemon-usage.md#device-registry-management) list, rename, update endpoints, and remove existing entries. There is no generic add command. Removal retains a replicated tombstone; it neither deletes remote copies nor revokes transport access.

Initialization uses a catalog-keyed receipt in the native Repo key/value namespace `todu-device-registry`. Established storage initializes once. Pending join validation records a pending receipt and does not self-enroll or migrate the target catalog; restart does not convert pending setup into membership. A marker referencing a catalog not stored locally is also treated as pending. Listener enablement leaves these behaviors unchanged.

**The registry is connection metadata, not authorization.** Its advertised endpoints supply native outbound targets when the daemon's dataset becomes active or when `todu sync peers reload` is invoked. Registry edits cannot enable another machine's listener or broaden its binding. Runtime presence and connection health remain local observations, not authoritative shared liveness fields.

## Trusted-LAN Boundary

The listener uses unencrypted HTTP/WebSocket transport with no cryptographic authentication or pairing. Restrict network access operationally; private IP addresses, announced storage IDs, and catalog routes do not establish trusted identity.

Any reachable peer that knows the catalog path can attempt native replication. The route selects the existing Repo context; it is not a per-document access-control boundary and does not filter unrelated documents already cached in that Repo. No registry-based `sharePolicy`, document-graph allowlist, or authentication layer is introduced. Do not expose this listener to an untrusted network or the internet.

There is no remote daemon RPC, administration, approval endpoint, or public dataset-listing API. General daemon operations remain on the private local socket.

## Listener Configuration and Endpoint Layout

Listening is disabled by default. It requires `enabled: true` and an explicit literal IPv4/IPv6 bind address. Hostname resolution is not used for binding. The configurable port defaults to `24377`; ports must be integers from 1 through 65535. Port zero, automatic port substitution, and automatic interface selection are not supported.

```yaml
sync:
  listener:
    enabled: true
    bind: 192.168.1.10
    port: 24377
```

Explicit all-interface addresses (`0.0.0.0` or `::`) are accepted only when supplied by the operator. An IPv6 binding is IPv6-only; it does not implicitly add IPv4 interfaces. A specific LAN address is preferable when only that interface should be reachable.

One embedded Node HTTP listener handles WebSocket upgrades through the existing native adapter:

```text
ws://<bind-address>:<port>/sync/<current-catalog-id>
```

Only the exact current-catalog path accepts upgrades. Wrong-catalog, trailing-path, query-bearing, RPC, and administration paths are rejected; there is no fallback dataset or account routing. The daemon also accepts bounded metadata-only `POST /enrollment/requests` and request-scoped `GET /enrollment/requests/<request-id>` on this same HTTP listener. Other HTTP routes return `404`; remote approval and administration are unavailable. No second service or document JSON transfer is introduced.

The daemon attaches the listener to its existing persistent Repo. Startup errors report the configured address/port and corrective action through private sync status and daemon logs while local reads, edits, and administration remain available. There is no silent rebind. Shutdown closes connections and listener resources before storage teardown; catalog switching recreates the listener for the newly attached engine's current catalog.

The existing loopback-only SDK sync-server helper and configured dedicated-server protocol retain their behavior. The LAN listener does not change `sync.remote`, activate a worker, or replace the existing server.

## Local Controls

```bash
todu sync listener enable --bind 192.168.1.10
todu sync listener enable --bind 192.168.1.10 --port 24400
todu daemon restart
todu sync listener status
todu --format json sync status
todu sync listener disable
todu daemon restart
```

Enable/disable commands patch only the local configuration file, preserving other settings and YAML comments. They explicitly report that a daemon restart is required; they do not remotely change a listener, modify the registry endpoint, or automatically restart the daemon. Use the same `--config`/`TODU_CONFIG` context as the daemon. A service-managed daemon uses its service configuration, not an arbitrary CLI override.

Status reports the running listener separately from the optional outbound server: `disabled`, `listening`, or `error`, with the actual configured binding, current sync path when listening, and actionable failure information. `listening` means accepting connections, not synchronized or offline-ready. Existing `sync start|stop|restart` commands control only the configured outbound server and are not a global LAN pause.

Before moving to an untrusted network, disable listening and explicitly restart, or stop the daemon. Saving `enabled: false` alone does not close a currently running listener. A future persisted global pause remains separate work.

## Managed Enrollment

The joining device supplies one known HTTP(S) source endpoint, not catalog or storage IDs. Its advertised listener endpoint is taken from its published local roster entry or explicit concrete listener configuration; `--advertise <base-endpoint>` is an optional override for wildcard bindings or a different advertised address. New requests require an endpoint and explicitly enabled local listener configuration; existing journals and endpoint-less entries remain readable. No interface discovery or implicit listener enablement occurs. Todu obtains its persistent native identity and sends readable registration metadata. The receiving daemon lists and approves or denies requests through its private local socket for its current catalog. Names, endpoints, and IDs are not authenticated identities.

For pristine storage, run `todu sync enrollment prepare` before first daemon/desktop startup, start the daemon, then run `todu sync enroll http://known-peer.lan:24377`. Pending startup has a persistent Repo identity but no live catalog, outbound document adapters, plugin loading, workers, or host template processing. Ordinary bootstrap and domain RPC cannot create a substitute dataset. Existing same-dataset replicas use their current engine and keep their native IDs, data, server configuration, provider state, assignments, and worker execution.

Requests expire after ten minutes while pending. The local approval journal is bounded to 128 records; request and response bodies are limited to 8 KiB, and HTTP exchanges have a five-second deadline. Durable approval intent precedes registry mutation/flush. Repeated requests for the same native identity deduplicate, and lost responses or partial approval recover without duplicate membership. An approved receipt carries only the catalog ID, native replica metadata, and exact native sync path; no response contains dataset documents.

The managed client validates approval against its current dataset and native identity before connecting. Pristine attachment uses native loading of the approved catalog and active roster entry, flushes them locally, then publishes the catalog marker without overwriting another dataset. An approved but failed attachment remains bound to that catalog so cached data cannot be repurposed as pristine storage for a different dataset. Cached documents are retained on failure; no substitute catalog is created. The explicit approved-source link persists across restart without editing `sync.remote`. Matching source/server links are reused for roster targets; obsolete managed links are disposed on explicit refresh. Initial pristine activation loads its first roster snapshot, while existing same-dataset enrollment does not implicitly refresh other target entries.

`sync enrollment cancel` stops local pending polling/attachment and retains identity, staged data, and any established source membership. An abandoned source request expires if still pending. Once approval intent is durable, denial/cleanup does not undo membership; already-approved entries remain even if the client never attaches. Inspect the roster and use explicit device management for stale entries rather than deleting them as pending cleanup. Active enrollment cannot be cancelled into an empty/default dataset. Removed identities are not automatically restored by enrollment.

Pristine approval does not start workers or replay host startup processing. Enrollment never imports plugin credentials or changes local worker settings. A later explicit normal daemon restart uses the installation's existing local startup/assignment configuration; no new execution-ownership policy is introduced.

Approval gates this managed enrollment workflow, not arbitrary reachable native peers that already know the catalog route. It is operational local approval on a trusted LAN, not encrypted pairing, authentication, or a transport authorization layer.

## Roster Connections and Explicit Reload

Each daemon reads the local catalog's active roster entries when its dataset becomes active. It skips its own persistent ID, removed entries, and entries without endpoints, and attaches native identity-checked connections at the exact current-catalog route. Existing transport retry/error handling is reused; an unavailable target does not block local work. Matching enrollment/configured-source connections are reused, and separately configured-server operation is preserved.

```bash
todu device list
todu device endpoint --url http://laptop.lan:24377
todu sync peers reload
todu --format json sync peers reload
```

Roster edits still synchronize as catalog data, but do not change a running target snapshot until reload or restart. Refresh retains matching links, removes obsolete managed links, and replaces changed endpoints. It does not enable/rebind a listener, change the local advertised endpoint, alter server configuration, or assign workers. Endpoint publication is not address discovery or a reachability guarantee. Publish a concrete reachable address, not `0.0.0.0` or `::`, and explicitly refresh peers after they receive the updated roster.

The command reports adapter-target reconciliation, not successful connection, document completeness, or remote persistence. Removing an entry affects managed links on refresh; it does not revoke arbitrary native transport access. Pending pristine startup and thin clients do not own roster connections. No new primary election, forwarding protocol, retry scheduler, or live roster watcher is introduced.

## Follow-up Work
- `task-e0d9e744`: Optional server management alongside direct peers.
- `task-75b82848`: Persisted synchronization pause/resume.
- `task-8cc052e1`: Accurate synchronization status without unsupported completeness or durability claims.
- `task-fe7f362e`: Distinct-replica recovery and rollout documentation.

Cancelled proposals are not prerequisites: `task-43b0e045` (complete offline replicas), `task-c5349136` (new automation-execution controls), and `task-dd563aa1` (registered-peer/document sharing restrictions). Cancellation does not mean their former acceptance criteria were implemented. Follow-up task records may still contain superseded dependencies or wording; reconcile them when those tasks are picked up rather than reintroducing cancelled features here.

## Automation, Rollout, and Recovery

Synchronization does not activate configured plugins or assign workers. Existing local configuration and worker assignment mechanisms remain responsible for execution. Recurring occurrence IDs are deterministic and generation checks existing occurrences; no new executor coordination or redesign is included.

Preserve provider credentials and runtime internals locally. A replicated dataset is not an independent backup, and local provider state is not replaced by synchronized metadata. Take independent backups and verify actual direct-peer operation before retiring a working server. Do not automatically delete server configuration or storage.

## Verification

Listener tests cover disabled defaults, explicit addresses and ports, current-catalog routing, refused remote administration, occupied-port/unavailable-address failures, private local operation after failures, bidirectional native exchange between established persistent replicas, preserved identities/settings/worker assignments, and resource cleanup on close/restart.

Enrollment tests also cover inert pristine startup, stable native identity initialization, approval and bidirectional native exchange, same-dataset data/settings/worker preservation, empty different-dataset refusal, metadata-only pending/denied/expired responses, wrong-catalog approval rejection, lost-response deduplication, partial durable approval, cancellation/abandonment, and restart. New roster coverage tests local selection, startup/activation, explicit reload, link reuse/removal, identity checks, and cleanup with simple mocked peer boundaries, including one local daemon/private RPC fixture. Existing integration tests remain intact. These checks do not prove real cross-device synchronization; manual production verification is described below. Tests do not expose the operator's LAN.

### Manual Production Verification

After an explicitly approved deployment, verify enrollment publishes the expected endpoint, actual peers exchange changes, and reload picks up additions/removals/address changes without altering local listener or worker/server settings. Check that reachable devices continue exchanging changes when another peer is offline, and observe restart/reconnection. Record which outcomes actually pass and which remain unverified; local mocks and green CI are not substitutes for these observations. No production settings/data changes or experiments are authorized by this checklist alone.

## Stable Dependencies and Sources

Use the existing stable Automerge/WebSocket dependencies. No new dependency or custom replication protocol is required.

- [Automerge repositories](https://automerge.org/docs/reference/repositories/).
- [Automerge native network synchronization](https://automerge.org/docs/tutorial/network-sync/).
- [Automerge document handles](https://automerge.org/docs/reference/repositories/dochandles/).
- [Native WebSocket adapters](https://github.com/automerge/automerge-repo/tree/v2.5.6/packages/automerge-repo-network-websocket).
- [Shared HTTP/WebSocket listener examples](https://github.com/websockets/ws#multiple-servers-sharing-a-single-https-server).
