import type { PeerCandidatePayload, PeerDisconnectedPayload } from "@automerge/automerge-repo/slim";
import type { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import {
  createDeviceId,
  deviceRegistryKey,
  err,
  ok,
  resolveSyncListenerConfig,
  storageError,
  updateRemoteSyncSettings,
  validateDeviceEndpoint,
  validationError,
} from "@todu/core";
import { createActorNamespace } from "./actors.js";
import { createApprovalNamespace } from "./approvals.js";
import { ensureAutomergeWasmInitialized } from "./automerge-init.js";
import { observeAllChanges } from "./change-observer.js";
import { createDeviceNamespace, registerApprovedDevice } from "./devices.js";
import {
  createEnrollmentPeerConnection,
  type EnrollmentPeerConnection,
  enrollmentSyncUrl,
} from "./enrollment-peer.js";
import { createHabitNamespace } from "./habits.js";
import { createIntegrationNamespace } from "./integrations.js";
import { createLabelNamespace } from "./labels.js";
import { createNoteNamespaces } from "./notes.js";
import { createRosterPeerConnections } from "./peer-connections.js";
import { createProjectNamespace } from "./projects.js";
import { createRecurringNamespace } from "./recurring.js";
import {
  createSyncRuntimeActorTools,
  createSyncRuntimeCommentProvenanceTools,
} from "./runtime-internals.js";
import { processTemplates } from "./scheduling.js";
import {
  createPersistentRepo,
  initBootstrapStorage,
  initEphemeralStorage,
  type Storage,
} from "./storage.js";
import {
  addRemoteSyncAdapter,
  connectSyncClient,
  disposeRemoteSyncAdapter,
  isSyncServerAvailable,
} from "./sync-client.js";
import { createSyncContentRecoveryStore } from "./sync-content-recovery.js";
import { type SyncListener, startSyncListener } from "./sync-listener.js";
import { type SyncServer, startSyncServer } from "./sync-server.js";
import { createTaskNamespaces } from "./tasks.js";
import {
  createStubNamespaces,
  type LocalSyncMode,
  type SyncStatus,
  type Todu,
  type ToduConfig,
  type ToduWithInternalTools,
} from "./todu.js";

export type { RemoteSyncConfig } from "@todu/core";
export { createEnrollmentClient, type EnrollmentClient } from "./enrollment-client.js";
export {
  createEnrollmentPeerConnection,
  type EnrollmentPeerConnection,
  type EnrollmentSource,
} from "./enrollment-peer.js";
export {
  createEnrollmentRequestStore,
  type EnrollmentRequestStore,
} from "./enrollment-requests.js";
export {
  commitEnrollmentCatalog,
  type LocalEnrollmentState,
  openPendingEnrollmentStorage,
  type PendingEnrollmentStorage,
  prepareEnrollmentStorage,
  readEnrollmentCatalogId,
  readEnrollmentState,
  validateEnrolledCatalog,
  writeEnrollmentState,
} from "./enrollment-storage.js";
export { registerHabitProcessor } from "./habits.js";
export type { TaskListCompactionResult } from "./maintenance.js";
export { compactTaskListDocument } from "./maintenance.js";
export type { PeerReloadReport } from "./peer-connections.js";
export type { UpcomingOccurrence } from "./recurring.js";
// Re-export schedule utilities for consumers
export {
  describeSchedule,
  isScheduledDate,
  nextOccurrence,
  nextOccurrences,
  todayInTimezone,
} from "./schedule.js";
export type { ProcessingContext, SchedulableItem, TemplateProcessor } from "./scheduling.js";
export { clearProcessors, getRegisteredProcessors, registerProcessor } from "./scheduling.js";
export type { CatalogJoinSwitch, Storage } from "./storage.js";
export {
  beginCatalogJoinSwitch,
  initBootstrapStorage,
  initJoinStorage,
} from "./storage.js";
export { addRemoteSyncAdapter, isSyncServerAvailable } from "./sync-client.js";
export {
  createSyncContentRecoveryStore,
  type SyncContentRecovery,
  type SyncContentRecoveryStore,
} from "./sync-content-recovery.js";
export { reconcileSyncTaskFieldGroup, syncTaskFieldGroupValuesEqual } from "./sync-field-groups.js";
export { DEFAULT_SYNC_PORT } from "./sync-server.js";
export type {
  ActorNamespace,
  ApprovalNamespace,
  ConfiguredServerStatus,
  DeviceNamespace,
  HabitNamespace,
  IntegrationNamespace,
  LabelNamespace,
  LocalSyncMode,
  NoteNamespace,
  ProjectNamespace,
  RecurringNamespace,
  RemoteSyncState,
  SyncListenerStatus,
  SyncRuntimeActorTools,
  SyncRuntimeNoteTools,
  SyncRuntimeTaskTools,
  SyncStatus,
  TaskNamespace,
  Todu,
  ToduConfig,
  ToduInternalTools,
  ToduWithInternalTools,
} from "./todu.js";

/**
 * Create a Todu SDK instance.
 *
 * Initializes Automerge storage, loads or creates the catalog document,
 * optionally runs host-configured startup processors, and returns the SDK
 * with all operation namespaces.
 *
 * Sync modes:
 * - `syncServer: true` — Start a WebSocket sync server. Other instances
 *   (CLI, other devices) can connect and sync. Used by Electron.
 * - `syncClient: true` — Connect to a running sync server. Changes
 *   propagate bidirectionally via Automerge sync protocol. Used by CLI.
 * - Neither — Standalone, no sync. Used by tests.
 */
export async function createTodu(
  config: Pick<ToduConfig, "storagePath"> & Partial<Omit<ToduConfig, "storagePath">>,
): Promise<Todu> {
  let serverSettings = {
    ...(config.remoteSyncSettings ??
      (config.remoteSync ? { ...config.remoteSync, enabled: true } : { enabled: false })),
  };
  let serverRunning = serverSettings.enabled && Boolean(serverSettings.server);
  const resolvedConfig: ToduConfig = {
    storagePath: config.storagePath,
    bootstrapOwnerActor: config.bootstrapOwnerActor,
    syncListener: config.syncListener,
    registeredPeerConnections: config.registeredPeerConnections,
    remoteSyncSettings: serverSettings,
    syncLogger: config.syncLogger,
    remoteSyncWatchdogIntervalMs: config.remoteSyncWatchdogIntervalMs,
    remoteSyncAvailabilityTimeoutMs: config.remoteSyncAvailabilityTimeoutMs,
  };

  await ensureAutomergeWasmInitialized();

  // Sync client mode: ephemeral in-memory repo that syncs with server
  // Sync server mode: persistent repo that serves sync clients
  // Standalone: persistent repo, no sync
  let syncServer: SyncServer | null = null;
  let storage: Storage;
  let initialRemoteAdapter: WebSocketClientAdapter | null = null;

  if (config.joinedStorage) {
    storage = config.joinedStorage;
    if (serverRunning && serverSettings.server)
      initialRemoteAdapter = addRemoteSyncAdapter(
        storage.repo,
        serverSettings.server,
        undefined,
        resolvedConfig.syncLogger,
      );
  } else if (config?.syncClient) {
    // Mode 2: CLI as ephemeral sync client
    // 1. Create ephemeral repo (no storage)
    // 2. Connect sync adapter so the repo has a peer
    // 3. Find catalog document — sync peer provides the data
    const ephemeral = await initEphemeralStorage(resolvedConfig.storagePath);
    const port = config.syncPort ?? 24377;
    await connectSyncClient(ephemeral.repo, `ws://127.0.0.1:${port}`);
    storage = await ephemeral.findCatalog();
  } else {
    // Mode 1 (standalone) or Electron (sync server)
    //
    // When remote sync is configured, the adapter MUST be connected before
    // loading the catalog. On join, the catalog document ID points to a
    // remote document not in local storage — without a network peer,
    // repo.find() marks it "unavailable" and throws.
    const repo = createPersistentRepo(resolvedConfig.storagePath);
    if (serverRunning && serverSettings.server) {
      initialRemoteAdapter = addRemoteSyncAdapter(
        repo,
        serverSettings.server,
        undefined,
        resolvedConfig.syncLogger,
      );
    }
    storage = await initBootstrapStorage(
      resolvedConfig.storagePath,
      repo,
      resolvedConfig.bootstrapOwnerActor,
    );

    if (config?.syncServer) {
      syncServer = startSyncServer(storage.repo, config.syncPort);
    }
  }

  // Host-owned startup processing policy. Engine bootstrap does not
  // register or special-case processor identities.
  if (config?.startupTemplateProcessing?.enabled === true) {
    await processTemplates(storage.catalog, {
      excludeTypes: config.startupTemplateProcessing.excludeTypes,
    });
  }

  // Determine local sync mode
  const localMode: LocalSyncMode = config?.syncClient
    ? "ephemeral-client"
    : config?.syncServer
      ? "sync-server"
      : "standalone";

  const syncStatus: SyncStatus = {
    listener: { state: "disabled" },
    local: { mode: localMode },
    remote: {
      state: "disconnected",
      server: serverSettings.server,
    },
  };

  // Listeners for sync status changes
  const syncStatusListeners = new Set<(status: SyncStatus) => void>();

  function notifySyncStatusListeners(): void {
    for (const cb of syncStatusListeners) cb(syncStatus);
  }

  let syncListener: SyncListener | null = null;
  const listenerConfig = resolveSyncListenerConfig(config.syncListener);
  const reportListenerError = (message: string): void => {
    syncStatus.listener = { ...syncStatus.listener, state: "error", error: message };
    resolvedConfig.syncLogger?.warn("LAN sync listener unavailable", { error: message });
    notifySyncStatusListeners();
  };
  if (!listenerConfig.ok) {
    reportListenerError(
      `Invalid ${listenerConfig.error.field}: ${listenerConfig.error.message}. Local daemon operations remain available.`,
    );
  } else if (listenerConfig.value && !storage.ephemeral) {
    syncStatus.listener = { state: "disabled", ...listenerConfig.value };
    const result = await startSyncListener({
      repo: storage.repo,
      catalogId: storage.catalog.documentId,
      config: listenerConfig.value,
      logger: resolvedConfig.syncLogger,
      onError: reportListenerError,
      httpHandler: config.enrollmentHttpHandler,
    });
    if (result.ok) {
      syncListener = result.value;
      syncStatus.listener = {
        state: "listening",
        ...listenerConfig.value,
        syncPath: result.value.syncPath,
      };
    } else {
      reportListenerError(result.error.message);
    }
  } else if (listenerConfig.value) {
    reportListenerError(
      "LAN listening requires a persistent Repo; ephemeral clients cannot listen.",
    );
  }

  // Remote sync adapter — set up if configured, null when stopped
  let remoteAdapter: WebSocketClientAdapter | null = null;
  let enrollmentPeer: EnrollmentPeerConnection | null = null;
  let borrowedServerPeer: EnrollmentPeerConnection | null = null;
  let removeServerCallbacks = (): void => {};
  let sharedEnrollmentSource = config.enrollmentSource ?? null;
  let peerConnections: ReturnType<typeof createRosterPeerConnections> | null = null;
  const pendingEnrollmentPeers = new Set<EnrollmentPeerConnection>();
  let engineClosed = false;
  let remoteWatchdogTimer: ReturnType<typeof setInterval> | null = null;
  let remoteWatchdogRestarting = false;
  let serverOperation: Promise<unknown> = Promise.resolve();
  function controlServer<T>(operation: () => Promise<T>): Promise<T> {
    const next = serverOperation.then(operation, operation);
    serverOperation = next;
    return next;
  }

  function setRemoteState(
    state: SyncStatus["remote"]["state"],
    options: { forceNotify?: boolean } = {},
  ): void {
    if (syncStatus.remote.state === state && !options.forceNotify) return;

    syncStatus.remote.state = state;
    notifySyncStatusListeners();
  }

  function isRemoteAdapterConnected(adapter: WebSocketClientAdapter): boolean {
    const socket = adapter.socket;
    return Boolean(adapter.remotePeerId && socket && socket.readyState === socket.OPEN);
  }

  function reconcileRemoteAdapterState(): void {
    if (borrowedServerPeer) remoteAdapter = borrowedServerPeer.getAdapter?.() ?? null;
    if (!remoteAdapter) return;

    if (isRemoteAdapterConnected(remoteAdapter)) {
      setRemoteState("connected");
    }
  }

  function startRemoteWatchdog(): void {
    if (!serverRunning || !serverSettings.server || remoteWatchdogTimer) return;

    remoteWatchdogTimer = setInterval(() => {
      void checkRemoteAdapterHealth();
    }, config.remoteSyncWatchdogIntervalMs ?? 30_000);
  }

  function stopRemoteWatchdog(): void {
    if (!remoteWatchdogTimer) return;

    clearInterval(remoteWatchdogTimer);
    remoteWatchdogTimer = null;
  }

  async function checkRemoteAdapterHealth(): Promise<void> {
    if (
      !serverRunning ||
      !serverSettings.server ||
      !remoteAdapter ||
      remoteWatchdogRestarting ||
      borrowedServerPeer ||
      engineClosed
    )
      return;
    const expectedAdapter = remoteAdapter;
    const server = serverSettings.server;

    reconcileRemoteAdapterState();
    if (syncStatus.remote.state !== "disconnected") return;

    const available = await isSyncServerAvailable(
      server,
      config.remoteSyncAvailabilityTimeoutMs ?? 200,
    );
    if (
      !available ||
      !serverRunning ||
      engineClosed ||
      remoteAdapter !== expectedAdapter ||
      serverSettings.server !== server ||
      syncStatus.remote.state !== "disconnected"
    )
      return;

    remoteWatchdogRestarting = true;
    resolvedConfig.syncLogger?.warn("remote sync watchdog restarting stale adapter", {
      server,
    });

    try {
      stopRemoteAdapter({ manual: false });
      startRemoteAdapter();
    } catch (error) {
      resolvedConfig.syncLogger?.warn("remote sync watchdog failed to replace stale adapter", {
        server,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      remoteWatchdogRestarting = false;
    }
  }

  /**
   * Attach a remote sync adapter to the repo and track connection state.
   * Non-blocking — the adapter retries automatically on disconnect.
   */
  function startRemoteAdapter(): void {
    if (!serverRunning || !serverSettings.server || remoteAdapter || engineClosed) return;
    const server = serverSettings.server;

    const onPeerCandidate = (payload: PeerCandidatePayload): void => {
      resolvedConfig.syncLogger?.info("remote sync peer connected", {
        server,
        peerId: payload.peerId,
      });
      setRemoteState("connected");
    };
    const preserveLostServerRoles = (): void => {
      void controlServer(async () => {
        if (!engineClosed && remoteAdapter?.url === new URL(server).href)
          await preserveServerPeerRoles();
      }).catch((error: unknown) =>
        resolvedConfig.syncLogger?.warn(
          "cannot preserve peer/source role after server disconnect",
          { error: String(error) },
        ),
      );
    };
    const onPeerDisconnected = (payload: PeerDisconnectedPayload): void => {
      resolvedConfig.syncLogger?.warn("remote sync peer disconnected", {
        server,
        peerId: payload.peerId,
      });
      setRemoteState("disconnected");
      preserveLostServerRoles();
    };
    const onClose = (): void => {
      resolvedConfig.syncLogger?.warn("remote sync adapter closed", {
        server,
      });
      setRemoteState("disconnected");
      preserveLostServerRoles();
    };
    // Reuse the adapter created during init (before catalog load) to avoid
    // a duplicate WebSocket connection. Only create a new one on restart.
    if (initialRemoteAdapter) {
      remoteAdapter = initialRemoteAdapter;
      initialRemoteAdapter = null;
    } else {
      const existing =
        peerConnections?.findByUrl(new URL(server).href) ??
        (enrollmentPeer && enrollmentSyncUrl(enrollmentPeer.source) === new URL(server).href
          ? enrollmentPeer
          : undefined);
      const available = existing?.getAdapter?.();
      if (available && existing?.retain) {
        borrowedServerPeer = existing.retain();
        remoteAdapter = available;
      } else
        remoteAdapter = addRemoteSyncAdapter(
          storage.repo,
          server,
          undefined,
          resolvedConfig.syncLogger,
        );
    }
    remoteAdapter.on("peer-candidate", onPeerCandidate);
    remoteAdapter.on("peer-disconnected", onPeerDisconnected);
    remoteAdapter.on("close", onClose);
    const observed = remoteAdapter;
    removeServerCallbacks = () => {
      observed.removeListener("peer-candidate", onPeerCandidate);
      observed.removeListener("peer-disconnected", onPeerDisconnected);
      observed.removeListener("close", onClose);
    };

    reconcileRemoteAdapterState();
    startRemoteWatchdog();
  }

  /**
   * Remove the remote adapter only after all adapter-owned resources are disposed.
   */
  function stopRemoteAdapter(options: { manual?: boolean; keepAlive?: boolean } = {}): void {
    if (!remoteAdapter && !borrowedServerPeer) return;

    if (options.manual !== false) {
      stopRemoteWatchdog();
    }

    removeServerCallbacks();
    removeServerCallbacks = () => {};
    if (borrowedServerPeer) {
      borrowedServerPeer.close();
      borrowedServerPeer = null;
    } else if (remoteAdapter && !options.keepAlive)
      disposeRemoteSyncAdapter(storage.repo, remoteAdapter);
    remoteAdapter = null;
    setRemoteState("disconnected", { forceNotify: options.manual !== false });
  }

  async function preserveServerPeerRoles(): Promise<void> {
    const adapter = remoteAdapter;
    if (!adapter) return;
    if (borrowedServerPeer) return;
    const sources = peerConnections?.serverSources(adapter.url) ?? [];
    const shared = sharedEnrollmentSource;
    if (shared && enrollmentSyncUrl(shared) === adapter.url && !enrollmentPeer)
      sources.push(shared);
    if (!sources.length) return;
    if (isRemoteAdapterConnected(adapter))
      for (const source of sources) await readyConfiguredSource(source);
    if (engineClosed) throw new Error("Engine closed during server/peer handoff");
    const current = peerConnections?.serverSources(adapter.url) ?? [];
    const source = current[0] ?? (sharedEnrollmentSource === shared ? shared : null);
    if (!source) return;
    const connection = createEnrollmentPeerConnection({
      repo: storage.repo,
      source,
      logger: resolvedConfig.syncLogger,
      adapter,
    });
    stopRemoteAdapter({ keepAlive: true });
    const adopted = peerConnections?.adoptServer(adapter.url, connection) ?? false;
    if (
      sharedEnrollmentSource === shared &&
      shared &&
      enrollmentSyncUrl(shared) === adapter.url &&
      !enrollmentPeer
    )
      enrollmentPeer = adopted ? connection.retain!() : connection;
    borrowedServerPeer = connection.retain!();
    remoteAdapter = adapter;
    if (!adopted && !enrollmentPeer) connection.close();
  }

  function configuredServerUrl(): string | undefined {
    return remoteAdapter?.url;
  }

  // Auto-start remote sync if configured
  if (serverRunning) {
    startRemoteAdapter();
  }

  const stubs = createStubNamespaces(resolvedConfig);
  const taskNamespaces = createTaskNamespaces(storage.catalog, storage.repo);
  const taskNamespace = taskNamespaces.namespace;
  const noteNamespaces = createNoteNamespaces(storage.catalog, storage.repo);
  const noteNamespace = noteNamespaces.namespace;

  const localStorageId = await storage.repo.storageId();
  async function readyConfiguredSource(
    source: import("./enrollment-peer.js").EnrollmentSource,
    signal?: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (true) {
      signal?.throwIfAborted();
      if (engineClosed) throw new Error("Engine closed during enrollment");
      const peerId = remoteAdapter?.remotePeerId;
      const identity = peerId ? storage.repo.getStorageIdOfPeer(peerId)?.slice(0) : undefined;
      if (identity === source.approval.sourceDeviceId) return;
      if (identity) throw new Error("Configured server is not the approved native source");
      if (Date.now() >= deadline)
        throw new Error("Configured source did not connect within 10000ms");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  peerConnections =
    config.registeredPeerConnections && !storage.ephemeral && localStorageId
      ? createRosterPeerConnections({
          repo: storage.repo,
          catalog: storage.catalog,
          localId: createDeviceId(localStorageId),
          logger: resolvedConfig.syncLogger,
          existing(source) {
            if (remoteAdapter && remoteAdapter.url === enrollmentSyncUrl(source)) {
              const identity = remoteAdapter.remotePeerId
                ? storage.repo.getStorageIdOfPeer(remoteAdapter.remotePeerId)?.slice(0)
                : undefined;
              if (identity && identity !== source.approval.sourceDeviceId)
                throw new Error(
                  "Configured connection announces a different native identity than its roster entry",
                );
              const adapter = remoteAdapter;
              return {
                source,
                serverBacked: true,
                ready: (signal) => readyConfiguredSource(source, signal),
                close() {},
                isClosed: () => remoteAdapter !== adapter,
              };
            }
            if (
              enrollmentPeer &&
              !enrollmentPeer.isClosed?.() &&
              enrollmentPeer.source.approval.sourceDeviceId === source.approval.sourceDeviceId &&
              enrollmentSyncUrl(enrollmentPeer.source) === enrollmentSyncUrl(source)
            ) {
              const connection = enrollmentPeer;
              return {
                source,
                ready: (signal) => connection.ready(signal),
                retain: () => connection.retain!(),
                getAdapter: () => connection.getAdapter?.() ?? null,
                isClosed: () => enrollmentPeer !== connection || Boolean(connection.isClosed?.()),
                close() {
                  if (!connection.isClosed?.()) connection.close();
                  if (enrollmentPeer === connection) enrollmentPeer = null;
                },
              };
            }
            return undefined;
          },
        })
      : null;
  const todu: ToduWithInternalTools = {
    ...stubs,
    __internal: {
      enrollment: {
        registerDevice: (device) =>
          registerApprovedDevice({ catalog: storage.catalog, repo: storage.repo, device }),
        async attachSource(source, signal) {
          let candidate: EnrollmentPeerConnection | null = null;
          try {
            signal?.throwIfAborted();
            if (engineClosed) throw new Error("Engine is closing enrollment connections");
            if (source.approval.catalogId !== storage.catalog.documentId)
              return err(storageError("Approved catalog does not match the active dataset"));
            const managed = peerConnections?.find(source);
            if (managed) {
              await managed.ready(signal);
              return ok(undefined);
            }
            if (remoteAdapter && remoteAdapter.url === enrollmentSyncUrl(source)) {
              await readyConfiguredSource(source, signal);
              sharedEnrollmentSource = source;
              return ok(undefined);
            }
            if (
              enrollmentPeer?.source.endpoint === source.endpoint &&
              enrollmentPeer.source.approval.sourceDeviceId === source.approval.sourceDeviceId
            ) {
              await enrollmentPeer.ready(signal);
            } else {
              candidate = createEnrollmentPeerConnection({
                repo: storage.repo,
                source,
                logger: resolvedConfig.syncLogger,
              });
              pendingEnrollmentPeers.add(candidate);
              await candidate.ready(signal);
              signal?.throwIfAborted();
              if (engineClosed) throw new Error("Engine closed during enrollment");
              enrollmentPeer?.close();
              enrollmentPeer = candidate;
              pendingEnrollmentPeers.delete(candidate);
              candidate = null;
            }
            return ok(undefined);
          } catch (error) {
            if (candidate) pendingEnrollmentPeers.delete(candidate);
            candidate?.close();
            return err(storageError(`Cannot attach approved source: ${String(error)}`));
          }
        },
      },
      syncRuntime: {
        flush: () => storage.repo.flush(),
        contentRecovery: createSyncContentRecoveryStore({
          storagePath: resolvedConfig.storagePath,
          catalogId: storage.catalog.documentId,
          ephemeral: storage.ephemeral,
        }),
        tasks: taskNamespaces.syncRuntime,
        notes: noteNamespaces.syncRuntime,
        actors: createSyncRuntimeActorTools(storage.catalog),
        commentProvenance: createSyncRuntimeCommentProvenanceTools(storage.catalog, storage.repo),
      },
    },
    device: createDeviceNamespace({
      catalog: storage.catalog,
      localDeviceId:
        !storage.ephemeral && localStorageId ? createDeviceId(localStorageId) : undefined,
    }),
    actor: createActorNamespace(storage.catalog),
    project: createProjectNamespace(storage.catalog),
    task: taskNamespace,
    label: createLabelNamespace(storage.catalog, storage.repo),
    integration: createIntegrationNamespace(storage.catalog, storage.repo),
    note: noteNamespace,
    approval: createApprovalNamespace(storage.catalog, taskNamespace, noteNamespace),
    recurring: createRecurringNamespace(storage.catalog, storage.repo),
    habit: createHabitNamespace(storage.catalog, storage.repo),
    sync: {
      serverStatus: () => {
        reconcileRemoteAdapterState();
        return { ...serverSettings, running: serverRunning, state: syncStatus.remote.state };
      },
      configureServer: (input) =>
        controlServer(async () => {
          const settings = updateRemoteSyncSettings(serverSettings, input);
          if (!settings.ok) return settings;
          if (engineClosed)
            return err(storageError("Cannot configure a server after engine shutdown"));
          const previous = serverSettings;
          const wasRunning = serverRunning;
          try {
            if (
              remoteAdapter &&
              (settings.value.server !== serverSettings.server || !settings.value.enabled)
            ) {
              await preserveServerPeerRoles();
              stopRemoteAdapter();
            }
            serverSettings = settings.value;
            resolvedConfig.remoteSyncSettings = serverSettings;
            serverRunning = serverSettings.enabled && Boolean(serverSettings.server);
            syncStatus.remote.server = serverSettings.server;
            if (serverRunning) startRemoteAdapter();
            else stopRemoteWatchdog();
            notifySyncStatusListeners();
            return ok({
              ...serverSettings,
              running: serverRunning,
              state: syncStatus.remote.state,
            });
          } catch (error) {
            serverSettings = previous;
            resolvedConfig.remoteSyncSettings = previous;
            serverRunning = wasRunning;
            syncStatus.remote.server = previous.server;
            try {
              if (wasRunning) startRemoteAdapter();
            } catch (restoreError) {
              return err(
                storageError(
                  `Cannot configure or restore the server path: ${String(error)}; ${String(restoreError)}`,
                ),
              );
            }
            return err(storageError(`Cannot configure the server path: ${String(error)}`));
          }
        }),
      reloadPeers: async () => {
        try {
          if (!peerConnections)
            return err(
              validationError(
                "sync.peers",
                "Roster connections require a daemon-owned persistent engine",
              ),
            );
          const source = enrollmentPeer?.source ?? sharedEnrollmentSource;
          if (source) {
            const device =
              storage.catalog.doc()?.[deviceRegistryKey(source.approval.sourceDeviceId)];
            if (
              device?.removed ||
              (device?.endpoint &&
                !validateDeviceEndpoint(device.endpoint) &&
                new URL(device.endpoint).origin !== new URL(source.endpoint).origin)
            ) {
              enrollmentPeer?.close();
              enrollmentPeer = null;
              sharedEnrollmentSource = null;
            }
          }
          return peerConnections.reload();
        } catch (error) {
          return err(storageError(`Cannot reload roster peers: ${String(error)}`));
        }
      },
      status: () => {
        reconcileRemoteAdapterState();
        return syncStatus;
      },
      start: () =>
        controlServer(async () => {
          if (engineClosed) throw new Error("Cannot start a server after engine shutdown");
          serverRunning = Boolean(serverSettings.server);
          startRemoteAdapter();
        }),
      stop: () =>
        controlServer(async () => {
          await preserveServerPeerRoles();
          serverRunning = false;
          stopRemoteAdapter();
          stopRemoteWatchdog();
        }),
      onStatusChange(callback: (status: SyncStatus) => void): () => void {
        syncStatusListeners.add(callback);
        return () => syncStatusListeners.delete(callback);
      },
      getCatalogId: () => storage.catalog.documentId,
    },
    onChange(callback: () => void): () => void {
      return observeAllChanges(storage.repo, callback);
    },
    async close() {
      engineClosed = true;
      peerConnections?.close();
      for (const peer of pendingEnrollmentPeers) peer.close();
      pendingEnrollmentPeers.clear();
      enrollmentPeer?.close();
      enrollmentPeer = null;
      if (syncListener) {
        await syncListener.close();
        syncListener = null;
        syncStatus.listener = { state: "disabled" };
      }
      // Stop remote adapter first to avoid reconnect attempts during shutdown
      stopRemoteAdapter();
      stopRemoteWatchdog();
      await serverOperation.catch((error: unknown) => {
        resolvedConfig.syncLogger?.warn("server control failed during engine shutdown", {
          error: String(error),
        });
      });
      // repo.shutdown() handles disconnecting remaining network adapters.
      await storage.close();
      if (syncServer) {
        await syncServer.close();
        syncServer = null;
      }
    },
  };

  if (
    config.enrollmentSource &&
    configuredServerUrl() !== enrollmentSyncUrl(config.enrollmentSource)
  ) {
    enrollmentPeer = createEnrollmentPeerConnection({
      repo: storage.repo,
      source: config.enrollmentSource,
      logger: resolvedConfig.syncLogger,
    });
  }
  return todu;
}
