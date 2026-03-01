import type { DocumentId } from "@automerge/automerge-repo";
import { type RemoteSyncConfig, resolveStoragePath } from "@todu/core";
import { beginCatalogJoinSwitch, createTodu, initJoinStorage, type Todu } from "@todu/engine";
import { createCoreNamespaceHandlers, mergeNamespaceHandlerSets } from "./core-rpc-adapters.js";
import {
  createDaemonLogger,
  type DaemonLogger,
  type DaemonLogLevel,
  resolveDaemonLogLevelFromEnv,
} from "./logger.js";
import {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolSuccessFrame,
  type ProtocolRequestFrame,
} from "./protocol.js";
import {
  createDaemonRpcRouter,
  type DaemonRpcMethodHandler,
  type DaemonRpcNamespaceHandlers,
  DEFAULT_DAEMON_REQUEST_TIMEOUT_MS,
  DEFAULT_DAEMON_VERSION,
} from "./rpc.js";
import {
  createUdsTransport,
  resolveUdsSocketPath,
  type UdsEndpoint,
  type UdsTransport,
} from "./transport.js";

export const DAEMON_ROLES = ["node", "authority"] as const;

export type DaemonRole = (typeof DAEMON_ROLES)[number];

export function isDaemonRole(value: string): value is DaemonRole {
  return (DAEMON_ROLES as readonly string[]).includes(value);
}

export type DaemonRuntimeState = "stopped" | "starting" | "running" | "stopping";

export interface DaemonRuntimeConfig {
  storagePath?: string;
  role?: DaemonRole;
  remoteSync?: RemoteSyncConfig;
  socketPath?: string;
  socketMode?: number;
  daemonVersion?: string;
  requestTimeoutMs?: number;
  logLevel?: DaemonLogLevel;
  logger?: DaemonLogger;
  rpcMethodHandlers?: Partial<Record<string, DaemonRpcMethodHandler>>;
  rpcNamespaceHandlers?: DaemonRpcNamespaceHandlers;
}

export interface ResolvedDaemonRuntimeConfig {
  storagePath: string;
  role: DaemonRole;
  remoteSync?: RemoteSyncConfig;
  socketPath: string;
  socketMode: number;
  daemonVersion: string;
  requestTimeoutMs: number;
  logLevel: DaemonLogLevel;
}

export interface DaemonRuntimeStatus {
  state: DaemonRuntimeState;
  role: DaemonRole;
  startedAt?: string;
  catalogId?: string;
  transport?: UdsEndpoint;
}

export interface DaemonRuntime {
  start(): Promise<DaemonRuntimeStatus>;
  stop(): Promise<void>;
  status(): DaemonRuntimeStatus;
  config(): ResolvedDaemonRuntimeConfig;
}

interface JoinOperationResult {
  mode: "check" | "join";
  previousCatalogId: string;
  targetCatalogId: string;
  switched: boolean;
  rolledBack: boolean;
}

export function createDaemonRuntime(config: DaemonRuntimeConfig = {}): DaemonRuntime {
  const resolvedStoragePath = config.storagePath ?? resolveStoragePath();
  const resolvedSocketPath = resolveUdsSocketPath(resolvedStoragePath, config.socketPath);
  const resolvedLogLevel = config.logLevel ?? resolveDaemonLogLevelFromEnv(process.env);

  const resolvedConfig: ResolvedDaemonRuntimeConfig = {
    storagePath: resolvedStoragePath,
    role: config.role ?? "node",
    remoteSync: config.remoteSync,
    socketPath: resolvedSocketPath,
    socketMode: config.socketMode ?? 0o600,
    daemonVersion:
      config.daemonVersion ?? process.env.TODUAI_DAEMON_VERSION ?? DEFAULT_DAEMON_VERSION,
    requestTimeoutMs:
      config.requestTimeoutMs ??
      parsePositiveInteger(process.env.TODUAI_DAEMON_REQUEST_TIMEOUT_MS) ??
      DEFAULT_DAEMON_REQUEST_TIMEOUT_MS,
    logLevel: resolvedLogLevel,
  };

  let todu: Todu | null = null;
  let startPromise: Promise<DaemonRuntimeStatus> | null = null;
  let stopPromise: Promise<void> | null = null;
  let joinPromise: Promise<JoinOperationResult> | null = null;
  let changeSubscriptionCleanup: (() => void) | null = null;
  let syncStatusSubscriptionCleanup: (() => void) | null = null;

  const runtimeStatus: DaemonRuntimeStatus = {
    state: "stopped",
    role: resolvedConfig.role,
  };

  const runtimeLogger =
    config.logger ??
    createDaemonLogger({
      component: "daemon.runtime",
      level: resolvedConfig.logLevel,
    });

  const defaultNamespaceHandlers = mergeNamespaceHandlerSets(
    createCoreNamespaceHandlers({
      getTodu: () => todu,
    }),
    createJoinSyncNamespaceHandlers(),
  );

  const rpcLogger = runtimeLogger.child("rpc");

  const rpcRouter = createDaemonRpcRouter({
    methodHandlers: config.rpcMethodHandlers,
    namespaceHandlers: mergeNamespaceHandlerSets(
      defaultNamespaceHandlers,
      config.rpcNamespaceHandlers ?? {},
    ),
    logger: rpcLogger,
  });

  const transport = createUdsTransport({
    storagePath: resolvedConfig.storagePath,
    socketPath: resolvedConfig.socketPath,
    socketMode: resolvedConfig.socketMode,
    onConnection: rpcRouter.createConnectionHandler(
      () => ({
        daemonVersion: resolvedConfig.daemonVersion,
        role: runtimeStatus.role,
        catalogId: todu?.sync.getCatalogId() ?? runtimeStatus.catalogId ?? null,
        runtimeState: runtimeStatus.state,
        startedAt: runtimeStatus.startedAt ?? null,
        transport: runtimeStatus.transport
          ? {
              kind: runtimeStatus.transport.kind,
              path: runtimeStatus.transport.path,
              mode: runtimeStatus.transport.mode,
            }
          : null,
      }),
      {
        requestTimeoutMs: resolvedConfig.requestTimeoutMs,
      },
    ),
  });

  function clearEventSubscriptions(): void {
    if (changeSubscriptionCleanup) {
      changeSubscriptionCleanup();
      changeSubscriptionCleanup = null;
    }

    if (syncStatusSubscriptionCleanup) {
      syncStatusSubscriptionCleanup();
      syncStatusSubscriptionCleanup = null;
    }
  }

  function attachEventSubscriptions(activeTodu: Todu): void {
    clearEventSubscriptions();

    changeSubscriptionCleanup = activeTodu.onChange(() => {
      rpcRouter.dispatchEvent("data.changed", {
        catalog: {
          id: todu?.sync.getCatalogId() ?? runtimeStatus.catalogId ?? null,
        },
      });
    });

    syncStatusSubscriptionCleanup = activeTodu.sync.onStatusChange((status) => {
      rpcRouter.dispatchEvent("sync.statusChanged", status);
    });
  }

  function cloneStatus(): DaemonRuntimeStatus {
    return {
      state: runtimeStatus.state,
      role: runtimeStatus.role,
      startedAt: runtimeStatus.startedAt,
      catalogId: runtimeStatus.catalogId,
      transport: runtimeStatus.transport,
    };
  }

  async function startInternal(): Promise<DaemonRuntimeStatus> {
    runtimeStatus.state = "starting";
    runtimeLogger.info("daemon runtime start requested", {
      role: runtimeStatus.role,
      socketPath: resolvedConfig.socketPath,
    });

    try {
      const endpoint = await transport.start();

      const startedTodu = await createTodu({
        storagePath: resolvedConfig.storagePath,
        remoteSync: resolvedConfig.remoteSync,
      });

      todu = startedTodu;
      runtimeStatus.state = "running";
      runtimeStatus.startedAt = new Date().toISOString();
      runtimeStatus.catalogId = startedTodu.sync.getCatalogId();
      runtimeStatus.transport = endpoint;

      attachEventSubscriptions(startedTodu);

      runtimeLogger.info("daemon runtime started", {
        role: runtimeStatus.role,
        socketPath: endpoint.path,
        catalogId: runtimeStatus.catalogId,
      });

      return cloneStatus();
    } catch (error) {
      clearEventSubscriptions();
      await safeStopTransport(transport);
      runtimeStatus.state = "stopped";
      runtimeStatus.startedAt = undefined;
      runtimeStatus.catalogId = undefined;
      runtimeStatus.transport = undefined;
      todu = null;
      runtimeLogger.error("daemon runtime failed to start", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  function createJoinSyncNamespaceHandlers(): DaemonRpcNamespaceHandlers {
    return {
      sync: {
        join: async (request) => {
          const parsedRequest = parseJoinRequest(request);
          if ("error" in parsedRequest) {
            return parsedRequest.error;
          }

          if (joinPromise) {
            return createProtocolErrorFrame(
              request.id,
              createProtocolError("CONFLICT", "Join operation already in progress", {
                method: request.method,
              }),
            );
          }

          joinPromise = executeJoinOperation(
            parsedRequest.targetCatalogId,
            parsedRequest.checkOnly,
          );

          try {
            const result = await joinPromise;
            return createProtocolSuccessFrame(request.id, result);
          } catch (error) {
            return createProtocolErrorFrame(request.id, error);
          } finally {
            joinPromise = null;
          }
        },
      },
    };
  }

  function parseJoinRequest(request: ProtocolRequestFrame):
    | {
        targetCatalogId: string;
        checkOnly: boolean;
      }
    | {
        error: ReturnType<typeof createProtocolErrorFrame>;
      } {
    const catalogIdParam = request.params.catalogId;

    if (typeof catalogIdParam !== "string" || catalogIdParam.trim().length === 0) {
      return {
        error: createProtocolErrorFrame(
          request.id,
          createProtocolError("BAD_REQUEST", "sync.join requires params.catalogId string", {
            field: "catalogId",
          }),
        ),
      };
    }

    const checkParam = request.params.check;
    if (checkParam !== undefined && typeof checkParam !== "boolean") {
      return {
        error: createProtocolErrorFrame(
          request.id,
          createProtocolError("BAD_REQUEST", "sync.join requires params.check boolean", {
            field: "check",
          }),
        ),
      };
    }

    const targetCatalogId = catalogIdParam.trim();
    if (!isValidJoinCodeFormat(targetCatalogId)) {
      return {
        error: createProtocolErrorFrame(
          request.id,
          createProtocolError("JOIN_FAILED", "Join validation failed", {
            stage: "validate-format",
            reason: "invalid_catalog_id_format",
            targetCatalogId,
          }),
        ),
      };
    }

    return {
      targetCatalogId,
      checkOnly: checkParam === true,
    };
  }

  async function executeJoinOperation(
    targetCatalogId: string,
    checkOnly: boolean,
  ): Promise<JoinOperationResult> {
    if (runtimeStatus.state !== "running" || !todu) {
      throw createProtocolError("PRECONDITION_FAILED", "Daemon runtime is not ready for join", {
        state: runtimeStatus.state,
      });
    }

    const previousCatalogId = todu.sync.getCatalogId();

    if (targetCatalogId === previousCatalogId) {
      return {
        mode: checkOnly ? "check" : "join",
        previousCatalogId,
        targetCatalogId,
        switched: false,
        rolledBack: false,
      };
    }

    await validateJoinTarget(targetCatalogId);

    if (checkOnly) {
      return {
        mode: "check",
        previousCatalogId,
        targetCatalogId,
        switched: false,
        rolledBack: false,
      };
    }

    const targetDocumentId = targetCatalogId as DocumentId;
    const tx = beginCatalogJoinSwitch(resolvedConfig.storagePath, targetDocumentId);
    const previousTodu = todu;

    try {
      clearEventSubscriptions();
      todu = null;
      await previousTodu.close();

      const joinedTodu = await createTodu({
        storagePath: resolvedConfig.storagePath,
        remoteSync: resolvedConfig.remoteSync,
      });

      todu = joinedTodu;
      runtimeStatus.catalogId = joinedTodu.sync.getCatalogId();
      attachEventSubscriptions(joinedTodu);
      tx.commit();

      return {
        mode: "join",
        previousCatalogId,
        targetCatalogId,
        switched: runtimeStatus.catalogId === targetCatalogId,
        rolledBack: false,
      };
    } catch (error) {
      tx.rollback();

      let restoredCatalogId = previousCatalogId;
      try {
        const restoredTodu = await createTodu({
          storagePath: resolvedConfig.storagePath,
          remoteSync: resolvedConfig.remoteSync,
        });
        todu = restoredTodu;
        runtimeStatus.catalogId = restoredTodu.sync.getCatalogId();
        restoredCatalogId = runtimeStatus.catalogId;
        attachEventSubscriptions(restoredTodu);
      } catch (restoreError) {
        runtimeLogger.error("daemon join rollback restore failed", {
          previousCatalogId,
          targetCatalogId,
          switchError: getErrorMessage(error),
          restoreError: getErrorMessage(restoreError),
        });

        todu = null;
        clearEventSubscriptions();
        runtimeStatus.catalogId = undefined;

        throw createProtocolError(
          "JOIN_FAILED",
          "Join failed and rollback restore could not recover runtime",
          {
            stage: "rollback-restore",
            previousCatalogId,
            targetCatalogId,
            switchError: getErrorMessage(error),
            restoreError: getErrorMessage(restoreError),
          },
        );
      }

      throw createProtocolError(
        "JOIN_FAILED",
        "Join switch failed; rolled back to previous catalog",
        {
          stage: "switch",
          previousCatalogId,
          targetCatalogId,
          restoredCatalogId,
          cause: getErrorMessage(error),
        },
      );
    }
  }

  async function validateJoinTarget(targetCatalogId: string): Promise<void> {
    try {
      const validationStorage = await initJoinStorage(
        resolvedConfig.storagePath,
        targetCatalogId as DocumentId,
      );
      await validationStorage.close();
    } catch (error) {
      throw createProtocolError("JOIN_FAILED", "Join validation failed", {
        stage: "validate-reachability",
        targetCatalogId,
        cause: getErrorMessage(error),
      });
    }
  }

  return {
    async start(): Promise<DaemonRuntimeStatus> {
      if (runtimeStatus.state === "running") {
        return cloneStatus();
      }

      if (startPromise) {
        return startPromise;
      }

      startPromise = startInternal().finally(() => {
        startPromise = null;
      });

      return startPromise;
    },

    async stop(): Promise<void> {
      if (stopPromise) {
        return stopPromise;
      }

      stopPromise = (async () => {
        if (startPromise) {
          try {
            await startPromise;
          } catch {
            // start() failure already reset runtime status
          }
        }

        runtimeLogger.info("daemon runtime stop requested", {
          role: runtimeStatus.role,
          state: runtimeStatus.state,
        });

        runtimeStatus.state = "stopping";

        const currentTodu = todu;
        todu = null;
        clearEventSubscriptions();

        try {
          await transport.stop();

          if (currentTodu) {
            await currentTodu.close();
          }
        } finally {
          runtimeStatus.state = "stopped";
          runtimeStatus.startedAt = undefined;
          runtimeStatus.catalogId = undefined;
          runtimeStatus.transport = undefined;
          runtimeLogger.info("daemon runtime stopped", {
            role: runtimeStatus.role,
          });
        }
      })().finally(() => {
        stopPromise = null;
      });

      return stopPromise;
    },

    status(): DaemonRuntimeStatus {
      return cloneStatus();
    },

    config(): ResolvedDaemonRuntimeConfig {
      return {
        storagePath: resolvedConfig.storagePath,
        role: resolvedConfig.role,
        remoteSync: resolvedConfig.remoteSync,
        socketPath: resolvedConfig.socketPath,
        socketMode: resolvedConfig.socketMode,
        daemonVersion: resolvedConfig.daemonVersion,
        requestTimeoutMs: resolvedConfig.requestTimeoutMs,
        logLevel: resolvedConfig.logLevel,
      };
    },
  };
}

function isValidJoinCodeFormat(value: string): boolean {
  if (value.length < 10) {
    return false;
  }

  return /^[a-zA-Z0-9+/=_-]+$/.test(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (parsed < 1) {
    return undefined;
  }

  return Math.floor(parsed);
}

async function safeStopTransport(transport: UdsTransport): Promise<void> {
  try {
    await transport.stop();
  } catch {
    // best-effort cleanup path after start() failures
  }
}
