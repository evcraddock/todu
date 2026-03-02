import type { DocumentId } from "@automerge/automerge-repo";
import { err, ok, type RemoteSyncConfig, type Result, resolveStoragePath } from "@todu/core";
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
import {
  createWorkerDependencyBlockedReason,
  createWorkerNotAssignedReason,
  createWorkerRegistry,
  findMissingRequiredWorkerDomains,
  type RegisteredWorkerSnapshot,
  WORKER_DOMAIN_CAPABILITIES,
  type WorkerDomainCapability,
  type WorkerLifecycleState,
  type WorkerLifecycleTransitionDetails,
  type WorkerRegistration,
  type WorkerRegistryError,
} from "./workers.js";

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
  workerRegistrations?: WorkerRegistration[];
  enabledWorkerDomains?: WorkerDomainCapability[];
  assignedWorkerTypes?: string[];
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
  enabledWorkerDomains: WorkerDomainCapability[];
  assignedWorkerTypes?: string[];
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
  registerWorker(
    registration: WorkerRegistration,
  ): Result<RegisteredWorkerSnapshot, WorkerRegistryError>;
  transitionWorkerState(
    workerType: string,
    state: WorkerLifecycleState,
    details?: WorkerLifecycleTransitionDetails,
  ): Result<RegisteredWorkerSnapshot, WorkerRegistryError>;
  getWorker(workerType: string): RegisteredWorkerSnapshot | undefined;
  listWorkers(): RegisteredWorkerSnapshot[];
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
  const resolvedEnabledWorkerDomains = resolveEnabledWorkerDomains(config.enabledWorkerDomains);
  const assignmentResolution = resolveAssignedWorkerTypes(config.assignedWorkerTypes);

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
    enabledWorkerDomains: resolvedEnabledWorkerDomains,
    assignedWorkerTypes: assignmentResolution.assignedWorkerTypes,
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

  const workerRegistry = createWorkerRegistry();

  const runtimeLogger =
    config.logger ??
    createDaemonLogger({
      component: "daemon.runtime",
      level: resolvedConfig.logLevel,
    });

  if (assignmentResolution.duplicateWorkerTypes.length > 0) {
    runtimeLogger.warn("duplicate worker assignment entries detected", {
      duplicateWorkerTypes: assignmentResolution.duplicateWorkerTypes,
      assignedWorkerTypes: resolvedConfig.assignedWorkerTypes ?? null,
    });
  }

  function createDependencyBlockedError(
    workerType: string,
    missingRequiredDomains: readonly WorkerDomainCapability[],
    blockedReason: string,
  ): WorkerRegistryError {
    return {
      code: "DEPENDENCY_BLOCKED",
      message: `Worker cannot transition to running because required domains are unavailable: ${workerType}`,
      details: {
        workerType,
        blockedReason,
        missingRequiredDomains,
        enabledWorkerDomains: resolvedConfig.enabledWorkerDomains,
      },
    };
  }

  function createNotAssignedError(workerType: string, blockedReason: string): WorkerRegistryError {
    return {
      code: "NOT_ASSIGNED",
      message: `Worker is not assigned to this daemon: ${workerType}`,
      details: {
        workerType,
        blockedReason,
        assignedWorkerTypes: resolvedConfig.assignedWorkerTypes ?? null,
      },
    };
  }

  function isWorkerAssigned(workerType: string): boolean {
    if (!resolvedConfig.assignedWorkerTypes) {
      return true;
    }

    return resolvedConfig.assignedWorkerTypes.includes(workerType);
  }

  function applyWorkerAssignmentGating(
    workerType: string,
  ): Result<RegisteredWorkerSnapshot, WorkerRegistryError> {
    const normalizedWorkerType = workerType.trim();
    const worker = workerRegistry.get(normalizedWorkerType);
    if (!worker) {
      return err({
        code: "NOT_FOUND",
        message: `Worker is not registered: ${normalizedWorkerType}`,
        details: {
          workerType: normalizedWorkerType,
        },
      });
    }

    if (isWorkerAssigned(worker.manifest.type)) {
      return ok(worker);
    }

    const blockedReason = createWorkerNotAssignedReason(worker.manifest.type);

    if (worker.state === "blocked" && worker.blockedReason === blockedReason) {
      return ok(worker);
    }

    const blockedTransition = workerRegistry.transition(normalizedWorkerType, "blocked", {
      blockedReason,
    });

    if (!blockedTransition.ok) {
      return blockedTransition;
    }

    runtimeLogger.warn("worker blocked by static assignment", {
      workerType: normalizedWorkerType,
      blockedReason,
      assignedWorkerTypes: resolvedConfig.assignedWorkerTypes ?? null,
    });

    return blockedTransition;
  }

  function applyWorkerDependencyGating(
    workerType: string,
  ): Result<RegisteredWorkerSnapshot, WorkerRegistryError> {
    const normalizedWorkerType = workerType.trim();
    const worker = workerRegistry.get(normalizedWorkerType);
    if (!worker) {
      return err({
        code: "NOT_FOUND",
        message: `Worker is not registered: ${normalizedWorkerType}`,
        details: {
          workerType: normalizedWorkerType,
        },
      });
    }

    const missingRequiredDomains = findMissingRequiredWorkerDomains(
      worker.manifest.requiredDomains,
      resolvedConfig.enabledWorkerDomains,
    );

    if (missingRequiredDomains.length === 0) {
      return ok(worker);
    }

    const blockedReason = createWorkerDependencyBlockedReason(missingRequiredDomains);

    if (worker.state === "blocked" && worker.blockedReason === blockedReason) {
      return ok(worker);
    }

    const blockedTransition = workerRegistry.transition(normalizedWorkerType, "blocked", {
      blockedReason,
    });

    if (!blockedTransition.ok) {
      return blockedTransition;
    }

    runtimeLogger.warn("worker blocked by required-domain gating", {
      workerType: normalizedWorkerType,
      blockedReason,
      missingRequiredDomains,
      enabledWorkerDomains: resolvedConfig.enabledWorkerDomains,
    });

    return blockedTransition;
  }

  for (const registration of config.workerRegistrations ?? []) {
    const registerResult = workerRegistry.register(registration);
    if (!registerResult.ok) {
      const workerType = registration.manifest?.type ?? "unknown";
      throw new Error(
        `Invalid worker registration for daemon runtime (${workerType}): ${registerResult.error.message}`,
      );
    }

    const assignmentGateResult = applyWorkerAssignmentGating(registerResult.value.manifest.type);
    if (!assignmentGateResult.ok) {
      throw new Error(
        `Failed to apply worker assignment gating for daemon runtime (${registerResult.value.manifest.type}): ${assignmentGateResult.error.message}`,
      );
    }

    if (!isWorkerAssigned(registerResult.value.manifest.type)) {
      continue;
    }

    const dependencyGateResult = applyWorkerDependencyGating(registerResult.value.manifest.type);
    if (!dependencyGateResult.ok) {
      throw new Error(
        `Failed to apply worker dependency gating for daemon runtime (${registerResult.value.manifest.type}): ${dependencyGateResult.error.message}`,
      );
    }
  }

  const defaultNamespaceHandlers = mergeNamespaceHandlerSets(
    mergeNamespaceHandlerSets(
      createCoreNamespaceHandlers({
        getTodu: () => todu,
      }),
      createJoinSyncNamespaceHandlers(),
    ),
    createWorkerNamespaceHandlers(),
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

  function createWorkerNamespaceHandlers(): DaemonRpcNamespaceHandlers {
    return {
      worker: {
        status: (request) => {
          const workerTypeParam = request.params.workerType;

          let workers: RegisteredWorkerSnapshot[];
          if (workerTypeParam === undefined) {
            workers = workerRegistry.list();
          } else {
            if (typeof workerTypeParam !== "string" || workerTypeParam.trim().length === 0) {
              return createProtocolErrorFrame(
                request.id,
                createProtocolError(
                  "BAD_REQUEST",
                  "worker.status requires optional params.workerType as a non-empty string",
                  {
                    field: "workerType",
                  },
                ),
              );
            }

            const normalizedWorkerType = workerTypeParam.trim();
            const worker = workerRegistry.get(normalizedWorkerType);
            if (!worker) {
              return createProtocolErrorFrame(
                request.id,
                createProtocolError(
                  "NOT_FOUND",
                  `Worker is not registered: ${normalizedWorkerType}`,
                  {
                    workerType: normalizedWorkerType,
                  },
                ),
              );
            }

            workers = [worker];
          }

          return createProtocolSuccessFrame(request.id, {
            workers: workers.map((worker) => {
              const missingRequiredDomains = findMissingRequiredWorkerDomains(
                worker.manifest.requiredDomains,
                resolvedConfig.enabledWorkerDomains,
              );

              return {
                type: worker.manifest.type,
                state: worker.state,
                blockedReason: worker.blockedReason ?? null,
                errorMessage: worker.errorMessage ?? null,
                updatedAt: worker.updatedAt,
                requiredDomains: [...worker.manifest.requiredDomains],
                optionalDomains: worker.manifest.optionalDomains
                  ? [...worker.manifest.optionalDomains]
                  : [],
                roleHints: worker.manifest.roleHints ? [...worker.manifest.roleHints] : [],
                isAssigned: isWorkerAssigned(worker.manifest.type),
                missingRequiredDomains,
              };
            }),
            assignment: {
              assignedWorkerTypes: resolvedConfig.assignedWorkerTypes
                ? [...resolvedConfig.assignedWorkerTypes]
                : null,
            },
            enabledWorkerDomains: [...resolvedConfig.enabledWorkerDomains],
          });
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

    registerWorker(registration): Result<RegisteredWorkerSnapshot, WorkerRegistryError> {
      const registerResult = workerRegistry.register(registration);
      if (!registerResult.ok) {
        return registerResult;
      }

      const assignmentGateResult = applyWorkerAssignmentGating(registerResult.value.manifest.type);
      if (!assignmentGateResult.ok) {
        return assignmentGateResult;
      }

      if (!isWorkerAssigned(registerResult.value.manifest.type)) {
        return assignmentGateResult;
      }

      return applyWorkerDependencyGating(registerResult.value.manifest.type);
    },

    transitionWorkerState(
      workerType,
      state,
      details,
    ): Result<RegisteredWorkerSnapshot, WorkerRegistryError> {
      if (state !== "running") {
        return workerRegistry.transition(workerType, state, details);
      }

      const assignmentGateResult = applyWorkerAssignmentGating(workerType);
      if (!assignmentGateResult.ok) {
        return assignmentGateResult;
      }

      if (!isWorkerAssigned(assignmentGateResult.value.manifest.type)) {
        const blockedReason =
          assignmentGateResult.value.blockedReason ??
          createWorkerNotAssignedReason(assignmentGateResult.value.manifest.type);
        return err(createNotAssignedError(assignmentGateResult.value.manifest.type, blockedReason));
      }

      const dependencyGateResult = applyWorkerDependencyGating(workerType);
      if (!dependencyGateResult.ok) {
        return dependencyGateResult;
      }

      const missingRequiredDomains = findMissingRequiredWorkerDomains(
        dependencyGateResult.value.manifest.requiredDomains,
        resolvedConfig.enabledWorkerDomains,
      );

      if (missingRequiredDomains.length > 0) {
        const blockedReason =
          dependencyGateResult.value.blockedReason ??
          createWorkerDependencyBlockedReason(missingRequiredDomains);

        return err(
          createDependencyBlockedError(
            dependencyGateResult.value.manifest.type,
            missingRequiredDomains,
            blockedReason,
          ),
        );
      }

      return workerRegistry.transition(workerType, state, details);
    },

    getWorker(workerType): RegisteredWorkerSnapshot | undefined {
      return workerRegistry.get(workerType);
    },

    listWorkers(): RegisteredWorkerSnapshot[] {
      return workerRegistry.list();
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
        enabledWorkerDomains: [...resolvedConfig.enabledWorkerDomains],
        assignedWorkerTypes: resolvedConfig.assignedWorkerTypes
          ? [...resolvedConfig.assignedWorkerTypes]
          : undefined,
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

function resolveEnabledWorkerDomains(
  domains: readonly WorkerDomainCapability[] | undefined,
): WorkerDomainCapability[] {
  if (!domains) {
    return [...WORKER_DOMAIN_CAPABILITIES];
  }

  const normalized: WorkerDomainCapability[] = [];
  for (const domain of domains) {
    if (!normalized.includes(domain)) {
      normalized.push(domain);
    }
  }

  return normalized;
}

function resolveAssignedWorkerTypes(workerTypes: readonly string[] | undefined): {
  assignedWorkerTypes: string[] | undefined;
  duplicateWorkerTypes: string[];
} {
  if (!workerTypes) {
    return {
      assignedWorkerTypes: undefined,
      duplicateWorkerTypes: [],
    };
  }

  const normalized: string[] = [];
  const duplicates: string[] = [];

  for (const workerType of workerTypes) {
    const trimmedWorkerType = workerType.trim();
    if (!trimmedWorkerType) {
      continue;
    }

    if (normalized.includes(trimmedWorkerType)) {
      if (!duplicates.includes(trimmedWorkerType)) {
        duplicates.push(trimmedWorkerType);
      }
      continue;
    }

    normalized.push(trimmedWorkerType);
  }

  return {
    assignedWorkerTypes: normalized,
    duplicateWorkerTypes: duplicates,
  };
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
