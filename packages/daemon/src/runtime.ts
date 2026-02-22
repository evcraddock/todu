import { type RemoteSyncConfig, resolveStoragePath } from "@todu/core";
import { createTodu, type Todu } from "@todu/engine";
import {
  createDaemonRpcRouter,
  type DaemonRpcMethodHandler,
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
  rpcMethodHandlers?: Partial<Record<string, DaemonRpcMethodHandler>>;
}

export interface ResolvedDaemonRuntimeConfig {
  storagePath: string;
  role: DaemonRole;
  remoteSync?: RemoteSyncConfig;
  socketPath: string;
  socketMode: number;
  daemonVersion: string;
  requestTimeoutMs: number;
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

export function createDaemonRuntime(config: DaemonRuntimeConfig = {}): DaemonRuntime {
  const resolvedStoragePath = config.storagePath ?? resolveStoragePath();
  const resolvedSocketPath = resolveUdsSocketPath(resolvedStoragePath, config.socketPath);

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
  };

  let todu: Todu | null = null;
  let startPromise: Promise<DaemonRuntimeStatus> | null = null;
  let stopPromise: Promise<void> | null = null;
  let changeSubscriptionCleanup: (() => void) | null = null;
  let syncStatusSubscriptionCleanup: (() => void) | null = null;

  const runtimeStatus: DaemonRuntimeStatus = {
    state: "stopped",
    role: resolvedConfig.role,
  };

  const rpcRouter = createDaemonRpcRouter({
    methodHandlers: config.rpcMethodHandlers,
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

    try {
      const endpoint = await transport.start();

      todu = await createTodu({
        storagePath: resolvedConfig.storagePath,
        remoteSync: resolvedConfig.remoteSync,
      });

      runtimeStatus.state = "running";
      runtimeStatus.startedAt = new Date().toISOString();
      runtimeStatus.catalogId = todu.sync.getCatalogId();
      runtimeStatus.transport = endpoint;

      changeSubscriptionCleanup = todu.onChange(() => {
        rpcRouter.dispatchEvent("data.changed", {
          catalog: {
            id: todu?.sync.getCatalogId() ?? runtimeStatus.catalogId ?? null,
          },
        });
      });

      syncStatusSubscriptionCleanup = todu.sync.onStatusChange((status) => {
        rpcRouter.dispatchEvent("sync.statusChanged", status);
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
      throw error;
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
      };
    },
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
