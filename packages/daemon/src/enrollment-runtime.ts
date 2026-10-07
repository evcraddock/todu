import os from "node:os";
import type { DocumentId } from "@automerge/automerge-repo";
import {
  type Device,
  err,
  isEnrollmentRequestId,
  ok,
  type Result,
  resolveEnrollmentEndpoint,
  type SyncListenerConfig,
  validationError,
} from "@todu/core";
import {
  commitEnrollmentCatalog,
  createEnrollmentClient,
  createEnrollmentPeerConnection,
  createEnrollmentRequestStore,
  type EnrollmentClient,
  type EnrollmentSource,
  initJoinStorage,
  openPendingEnrollmentStorage,
  type PendingEnrollmentStorage,
  readEnrollmentCatalogId,
  readEnrollmentState,
  type Storage,
  type Todu,
  type ToduWithInternalTools,
  validateEnrolledCatalog,
} from "@todu/engine";
import type { DaemonLogger } from "./logger.js";
import {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolSuccessFrame,
  mapErrorToProtocolError,
  type ProtocolRequestFrame,
} from "./protocol.js";
import type { DaemonRpcNamespaceHandlers } from "./rpc.js";

export function createEnrollmentRuntime(options: {
  storagePath: string;
  syncListener?: SyncListenerConfig;
  getTodu(): Todu | null;
  isRunning(): boolean;
  activateTodu(todu: Todu): void;
  createTodu(input: {
    joinedStorage: Storage;
    enrollmentSource: EnrollmentSource;
    skipProcessing: true;
  }): Promise<Todu>;
  logger: DaemonLogger;
}) {
  let pending: PendingEnrollmentStorage | null = null;
  let client: EnrollmentClient | null = null;
  const source = createEnrollmentRequestStore({
    storagePath: options.storagePath,
    async getContext() {
      const todu = options.getTodu();
      if (!todu || !options.isRunning()) return null;
      const id = await todu.device.localId();
      return id.ok ? { catalogId: todu.sync.getCatalogId(), deviceId: id.value } : null;
    },
    async registerDevice(device, catalogId) {
      const todu = options.getTodu();
      if (!todu || todu.sync.getCatalogId() !== catalogId)
        return err(
          validationError("catalogId", "Current catalog changed before enrollment approval"),
        );
      return (todu as ToduWithInternalTools).__internal.enrollment.registerDevice(device);
    },
  });

  async function getDevice(): Promise<Device> {
    const todu = options.getTodu();
    if (todu) {
      const id = await todu.device.localId();
      if (!id.ok) throw new Error("Current daemon has no native replica identity");
      const listed = await todu.device.list();
      if (!listed.ok) throw new Error("Cannot read current device metadata");
      return (
        listed.value.find((device) => device.id === id.value) ?? {
          id: id.value,
          name: os.hostname() || "Unnamed device",
        }
      );
    }
    pending ??= await openPendingEnrollmentStorage(options.storagePath);
    return { id: pending.deviceId, name: os.hostname() || "Unnamed device" };
  }

  async function activate(sourceInfo: EnrollmentSource, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const existing = options.getTodu();
    if (existing) {
      if (existing.sync.getCatalogId() !== sourceInfo.approval.catalogId)
        throw new Error("Different initialized catalog; enrollment is refused");
      const attached = await (existing as ToduWithInternalTools).__internal.enrollment.attachSource(
        sourceInfo,
        signal,
      );
      if (!attached.ok) throw new Error(JSON.stringify(attached.error));
      signal.throwIfAborted();
      if (
        options.getTodu() !== existing ||
        existing.sync.getCatalogId() !== sourceInfo.approval.catalogId
      )
        throw new Error("Current dataset changed during enrollment attachment");
      return;
    }
    pending ??= await openPendingEnrollmentStorage(options.storagePath);
    if (pending.deviceId !== sourceInfo.approval.deviceId)
      throw new Error("Approval does not match this pending native replica identity");
    const staged = pending;
    const connection = createEnrollmentPeerConnection({
      repo: staged.repo,
      source: sourceInfo,
      logger: options.logger,
    });
    let joined: Todu | null = null;
    try {
      await connection.ready(signal);
      const storage = await initJoinStorage(
        options.storagePath,
        sourceInfo.approval.catalogId as DocumentId,
        staged.repo,
        undefined,
        signal,
      );
      const deadline = Date.now() + 10_000;
      while (!validateEnrolledCatalog(storage.catalog.doc(), sourceInfo.approval).ok) {
        signal.throwIfAborted();
        if (Date.now() >= deadline)
          throw new Error(
            "Approved catalog or registry membership did not become valid within 10000ms",
          );
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await staged.repo.flush([storage.catalog.documentId]);
      signal.throwIfAborted();
      connection.close();
      joined = await options.createTodu({
        joinedStorage: storage,
        enrollmentSource: sourceInfo,
        skipProcessing: true,
      });
      const attached = await (joined as ToduWithInternalTools).__internal.enrollment.attachSource(
        sourceInfo,
        signal,
      );
      if (!attached.ok) throw new Error(JSON.stringify(attached.error));
      signal.throwIfAborted();
      if (!options.isRunning()) throw new Error("Daemon stopped before pending catalog activation");
      const local = readEnrollmentState(options.storagePath);
      if (!local || local.mode !== "pending")
        throw new Error("Pending setup changed before catalog activation");
      commitEnrollmentCatalog(options.storagePath, { ...local, approval: sourceInfo.approval });
      options.activateTodu(joined);
      pending = null;
      const reloaded = await joined.sync.reloadPeers();
      if (!reloaded.ok)
        options.logger.warn("enrolled roster peer reload failed", { error: reloaded.error });
    } catch (error) {
      connection.close();
      if (joined) await joined.close();
      else await staged.close();
      pending = null;
      throw error;
    }
  }

  function getClient(): EnrollmentClient {
    client ??= createEnrollmentClient({
      storagePath: options.storagePath,
      getDevice,
      getCatalogId: () =>
        options.getTodu()?.sync.getCatalogId() ??
        readEnrollmentState(options.storagePath)?.approval?.catalogId ??
        null,
      activate,
      logger: options.logger,
    });
    return client;
  }
  async function execute(request: ProtocolRequestFrame, action: () => Promise<Result<unknown>>) {
    if (!options.isRunning())
      return createProtocolErrorFrame(
        request.id,
        createProtocolError("PRECONDITION_FAILED", "Daemon is not running for enrollment"),
      );
    try {
      const result = await action();
      return result.ok
        ? createProtocolSuccessFrame(request.id, result.value)
        : createProtocolErrorFrame(request.id, mapErrorToProtocolError(result.error));
    } catch (error) {
      return createProtocolErrorFrame(request.id, error);
    }
  }
  function id(request: ProtocolRequestFrame) {
    if (!isEnrollmentRequestId(request.params.requestId))
      throw createProtocolError("BAD_REQUEST", "Expected a UUID enrollment requestId");
    return request.params.requestId;
  }
  const handlers: DaemonRpcNamespaceHandlers = {
    sync: {
      enroll: (request) =>
        execute(request, async () => {
          if (typeof request.params.endpoint !== "string")
            return err(
              validationError("endpoint", "Supply a known HTTP(S) listening base endpoint"),
            );
          const advertised = request.params.advertisedEndpoint;
          if (advertised !== undefined && typeof advertised !== "string")
            return err(
              validationError("advertisedEndpoint", "Expected an HTTP(S) listener endpoint"),
            );
          const device = await getDevice();
          const endpoint = resolveEnrollmentEndpoint({
            listener: options.syncListener,
            published: device.endpoint,
            override: advertised,
          });
          if (!endpoint.ok) return endpoint;
          return getClient().begin(request.params.endpoint, {
            registration: { ...device, endpoint: endpoint.value },
          });
        }),
      enrollmentStatus: (request) => execute(request, async () => ok(getClient().status())),
      enrollmentCancel: (request) => execute(request, () => getClient().cancel()),
      enrollmentRequests: (request) => execute(request, () => source.list()),
      enrollmentApprove: (request) => execute(request, () => source.approve(id(request))),
      enrollmentDeny: (request) => execute(request, () => source.deny(id(request))),
    },
  };
  return {
    handlers,
    handleHttp: source.handleHttp,
    initialSource(): EnrollmentSource | undefined {
      const local = readEnrollmentState(options.storagePath);
      return local?.mode === "active" &&
        local.connection?.approval.catalogId === readEnrollmentCatalogId(options.storagePath)
        ? local.connection
        : undefined;
    },
    async startPending(): Promise<boolean> {
      if (readEnrollmentState(options.storagePath)?.mode !== "pending") return false;
      pending = await openPendingEnrollmentStorage(options.storagePath);
      return true;
    },
    resume() {
      getClient().resume();
    },
    async stop() {
      await client?.stop();
      client = null;
      if (pending) {
        await pending.close();
        pending = null;
      }
    },
  };
}
