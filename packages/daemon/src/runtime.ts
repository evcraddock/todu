import { type RemoteSyncConfig, resolveStoragePath } from "@todu/core";
import { createTodu, type Todu } from "@todu/engine";

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
}

export interface ResolvedDaemonRuntimeConfig {
  storagePath: string;
  role: DaemonRole;
  remoteSync?: RemoteSyncConfig;
}

export interface DaemonRuntimeStatus {
  state: DaemonRuntimeState;
  role: DaemonRole;
  startedAt?: string;
  catalogId?: string;
}

export interface DaemonRuntime {
  start(): Promise<DaemonRuntimeStatus>;
  stop(): Promise<void>;
  status(): DaemonRuntimeStatus;
  config(): ResolvedDaemonRuntimeConfig;
}

export function createDaemonRuntime(config: DaemonRuntimeConfig = {}): DaemonRuntime {
  const resolvedConfig: ResolvedDaemonRuntimeConfig = {
    storagePath: config.storagePath ?? resolveStoragePath(),
    role: config.role ?? "node",
    remoteSync: config.remoteSync,
  };

  let todu: Todu | null = null;
  let startPromise: Promise<DaemonRuntimeStatus> | null = null;
  let stopPromise: Promise<void> | null = null;

  const runtimeStatus: DaemonRuntimeStatus = {
    state: "stopped",
    role: resolvedConfig.role,
  };

  function cloneStatus(): DaemonRuntimeStatus {
    return {
      state: runtimeStatus.state,
      role: runtimeStatus.role,
      startedAt: runtimeStatus.startedAt,
      catalogId: runtimeStatus.catalogId,
    };
  }

  async function startInternal(): Promise<DaemonRuntimeStatus> {
    runtimeStatus.state = "starting";

    try {
      todu = await createTodu({
        storagePath: resolvedConfig.storagePath,
        remoteSync: resolvedConfig.remoteSync,
      });

      runtimeStatus.state = "running";
      runtimeStatus.startedAt = new Date().toISOString();
      runtimeStatus.catalogId = todu.sync.getCatalogId();

      return cloneStatus();
    } catch (error) {
      runtimeStatus.state = "stopped";
      runtimeStatus.startedAt = undefined;
      runtimeStatus.catalogId = undefined;
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

        if (!todu) {
          runtimeStatus.state = "stopped";
          runtimeStatus.startedAt = undefined;
          runtimeStatus.catalogId = undefined;
          return;
        }

        runtimeStatus.state = "stopping";

        const current = todu;
        todu = null;

        try {
          await current.close();
        } finally {
          runtimeStatus.state = "stopped";
          runtimeStatus.startedAt = undefined;
          runtimeStatus.catalogId = undefined;
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
      };
    },
  };
}
