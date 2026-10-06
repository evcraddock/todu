# Device Sync: Single Dataset and Optional Servers

## Status

The replicated device registry and opt-in LAN listener are implemented. Local approval-based enrollment and automatic registry-derived connections remain follow-up work. This document supersedes the earlier roadmap's registry authorization, complete-offline-replica, and automation-ownership proposals, which were cancelled after reviewing the existing implementation and native Automerge behavior.

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

The future enrollment flow must refuse a different initialized dataset without replacement or merging, even when it contains no tasks. A pristine installation must join explicitly before normal catalog bootstrap rather than creating and overwriting a throwaway dataset. Those join operations are not implemented by the listener task.

## Replicated Device Registry

The existing catalog contains a shared device roster. Entries use root-level `device:<native-storage-id>` keys so replicas initialized independently can add entries without conflicting on creation of a parent map. Native Automerge handles convergence.

Each active entry contains:

- The persistent native storage ID.
- A readable device name, initially the local hostname.
- An optional HTTP(S) listening base endpoint.

[Local registry commands](../cli-daemon-usage.md#device-registry-management) list, rename, update endpoints, and remove existing entries. There is no generic add command. Removal retains a replicated tombstone; it neither deletes remote copies nor revokes transport access.

Initialization uses a catalog-keyed receipt in the native Repo key/value namespace `todu-device-registry`. Established storage initializes once. Pending join validation records a pending receipt and does not self-enroll or migrate the target catalog; restart does not convert pending setup into membership. A marker referencing a catalog not stored locally is also treated as pending. Listener enablement leaves these behaviors unchanged.

**The registry is connection metadata, not authorization.** Its endpoints will supply automatic connection targets in the connection-management task. Registry edits cannot enable another machine's listener or broaden its binding. Runtime presence and connection health remain local observations, not authoritative shared liveness fields.

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

Only the exact current-catalog path accepts upgrades. Wrong-catalog, trailing-path, query-bearing, RPC, and administration paths are rejected; there is no fallback dataset or account routing. Ordinary HTTP requests return `404`, including `/enrollment/requests`. The enrollment task will add its request handlers to this same HTTP listener, not start a second service or introduce remote approval.

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

## Follow-up Work

- `task-4e23e7e3`: Explicit join/enrollment and local approval using the shared listener. Preserve same-dataset replicas and refuse different initialized datasets.
- `task-b8e0cfb5`: Establish and maintain native connections using roster endpoints, including retries, endpoint changes, and cleanup. No permanent privileged peer or separately maintained peer list.
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

End-to-end pristine enrollment and automatic roster-derived connections are not claimed by these tests and remain follow-up work. Initial tests bind loopback rather than exposing the operator's LAN.

## Stable Dependencies and Sources

Use the existing stable Automerge/WebSocket dependencies. No new dependency or custom replication protocol is required.

- [Automerge repositories](https://automerge.org/docs/reference/repositories/).
- [Automerge native network synchronization](https://automerge.org/docs/tutorial/network-sync/).
- [Automerge document handles](https://automerge.org/docs/reference/repositories/dochandles/).
- [Native WebSocket adapters](https://github.com/automerge/automerge-repo/tree/v2.5.6/packages/automerge-repo-network-websocket).
- [Shared HTTP/WebSocket listener examples](https://github.com/websockets/ws#multiple-servers-sharing-a-single-https-server).
