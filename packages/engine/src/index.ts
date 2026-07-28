import {
  type PeerCandidatePayload,
  type PeerDisconnectedPayload,
  Repo,
} from "@automerge/automerge-repo/slim";
import type { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import { createActorNamespace } from "./actors.js";
import { createApprovalNamespace } from "./approvals.js";
import { ensureAutomergeWasmInitialized } from "./automerge-init.js";
import { observeAllChanges } from "./change-observer.js";
import { createHabitNamespace } from "./habits.js";
import { createIntegrationNamespace } from "./integrations.js";
import { createLabelNamespace } from "./labels.js";
import { createNoteNamespace } from "./notes.js";
import { createProjectNamespace } from "./projects.js";
import { createRecurringNamespace } from "./recurring.js";
import {
  createSyncRuntimeActorTools,
  createSyncRuntimeCommentProvenanceTools,
} from "./runtime-internals.js";
import { processTemplates } from "./scheduling.js";
import { initBootstrapStorage, initEphemeralStorage, type Storage } from "./storage.js";
import {
  addRemoteSyncAdapter,
  connectSyncClient,
  disposeRemoteSyncAdapter,
  isSyncServerAvailable,
} from "./sync-client.js";
import { type SyncServer, startSyncServer } from "./sync-server.js";
import { createTaskNamespace } from "./tasks.js";
import {
  createStubNamespaces,
  type LocalSyncMode,
  type SyncStatus,
  type Todu,
  type ToduConfig,
  type ToduWithInternalTools,
} from "./todu.js";

export type { RemoteSyncConfig } from "@todu/core";
export { registerHabitProcessor } from "./habits.js";
export type { TaskListCompactionResult } from "./maintenance.js";
export { compactTaskListDocument } from "./maintenance.js";
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
export { DEFAULT_SYNC_PORT } from "./sync-server.js";
export type {
  ActorNamespace,
  ApprovalNamespace,
  HabitNamespace,
  IntegrationNamespace,
  LabelNamespace,
  LocalSyncMode,
  NoteNamespace,
  ProjectNamespace,
  RecurringNamespace,
  RemoteSyncState,
  SyncRuntimeActorTools,
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
  const resolvedConfig: ToduConfig = {
    storagePath: config.storagePath,
    bootstrapOwnerActor: config.bootstrapOwnerActor,
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

  if (config?.syncClient) {
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
    const repo = new Repo({
      storage: new NodeFSStorageAdapter(resolvedConfig.storagePath),
    });
    if (config?.remoteSync) {
      initialRemoteAdapter = addRemoteSyncAdapter(
        repo,
        config.remoteSync.server,
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
    local: { mode: localMode },
    remote: {
      state: "disconnected",
      server: config?.remoteSync?.server,
    },
  };

  // Listeners for sync status changes
  const syncStatusListeners = new Set<(status: SyncStatus) => void>();

  function notifySyncStatusListeners(): void {
    for (const cb of syncStatusListeners) cb(syncStatus);
  }

  // Remote sync adapter — set up if configured, null when stopped
  let remoteAdapter: WebSocketClientAdapter | null = null;
  let remoteWatchdogTimer: ReturnType<typeof setInterval> | null = null;
  let remoteWatchdogRestarting = false;

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
    if (!remoteAdapter) return;

    if (isRemoteAdapterConnected(remoteAdapter)) {
      setRemoteState("connected");
    }
  }

  function startRemoteWatchdog(): void {
    if (!config?.remoteSync || remoteWatchdogTimer) return;

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
    if (!config?.remoteSync || !remoteAdapter || remoteWatchdogRestarting) return;

    reconcileRemoteAdapterState();
    if (syncStatus.remote.state !== "disconnected") return;

    const available = await isSyncServerAvailable(
      config.remoteSync.server,
      config.remoteSyncAvailabilityTimeoutMs ?? 200,
    );
    if (!available || !remoteAdapter || syncStatus.remote.state !== "disconnected") return;

    remoteWatchdogRestarting = true;
    resolvedConfig.syncLogger?.warn("remote sync watchdog restarting stale adapter", {
      server: config.remoteSync.server,
    });

    try {
      stopRemoteAdapter({ manual: false });
      startRemoteAdapter();
    } catch (error) {
      resolvedConfig.syncLogger?.warn("remote sync watchdog failed to replace stale adapter", {
        server: config.remoteSync.server,
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
    if (!config?.remoteSync || remoteAdapter) return;

    const onPeerCandidate = (payload: PeerCandidatePayload): void => {
      resolvedConfig.syncLogger?.info("remote sync peer connected", {
        server: config.remoteSync?.server,
        peerId: payload.peerId,
      });
      setRemoteState("connected");
    };
    const onPeerDisconnected = (payload: PeerDisconnectedPayload): void => {
      resolvedConfig.syncLogger?.warn("remote sync peer disconnected", {
        server: config.remoteSync?.server,
        peerId: payload.peerId,
      });
      setRemoteState("disconnected");
    };
    const onClose = (): void => {
      resolvedConfig.syncLogger?.warn("remote sync adapter closed", {
        server: config.remoteSync?.server,
      });
      setRemoteState("disconnected");
    };
    // Reuse the adapter created during init (before catalog load) to avoid
    // a duplicate WebSocket connection. Only create a new one on restart.
    if (initialRemoteAdapter) {
      remoteAdapter = initialRemoteAdapter;
      initialRemoteAdapter = null;
    } else {
      remoteAdapter = addRemoteSyncAdapter(
        storage.repo,
        config.remoteSync.server,
        undefined,
        resolvedConfig.syncLogger,
      );
    }
    remoteAdapter.on("peer-candidate", onPeerCandidate);
    remoteAdapter.on("peer-disconnected", onPeerDisconnected);
    remoteAdapter.on("close", onClose);

    reconcileRemoteAdapterState();
    startRemoteWatchdog();
  }

  /**
   * Remove the remote adapter only after all adapter-owned resources are disposed.
   */
  function stopRemoteAdapter(options: { manual?: boolean } = {}): void {
    if (!remoteAdapter) return;

    if (options.manual !== false) {
      stopRemoteWatchdog();
    }

    const adapter = remoteAdapter;
    disposeRemoteSyncAdapter(storage.repo, adapter);

    remoteAdapter = null;
    setRemoteState("disconnected", { forceNotify: options.manual !== false });
  }

  // Auto-start remote sync if configured
  if (config?.remoteSync) {
    startRemoteAdapter();
  }

  const stubs = createStubNamespaces(resolvedConfig);
  const taskNamespace = createTaskNamespace(storage.catalog, storage.repo);
  const noteNamespace = createNoteNamespace(storage.catalog, storage.repo);

  const todu: ToduWithInternalTools = {
    ...stubs,
    __internal: {
      syncRuntime: {
        actors: createSyncRuntimeActorTools(storage.catalog),
        commentProvenance: createSyncRuntimeCommentProvenanceTools(storage.catalog, storage.repo),
      },
    },
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
      status: () => {
        reconcileRemoteAdapterState();
        return syncStatus;
      },
      start: async () => {
        startRemoteAdapter();
      },
      stop: async () => {
        stopRemoteAdapter();
      },
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
      // Stop remote adapter first to avoid reconnect attempts during shutdown
      stopRemoteAdapter();
      stopRemoteWatchdog();
      // repo.shutdown() handles disconnecting remaining network adapters.
      await storage.close();
      if (syncServer) {
        await syncServer.close();
        syncServer = null;
      }
    },
  };

  return todu;
}
