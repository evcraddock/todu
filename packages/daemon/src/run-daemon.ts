import { loadDaemonFileConfig } from "./config.js";
import { createDaemonLogger, resolveDaemonLogLevelFromEnv } from "./logger.js";
import { parseDaemonPluginConfigFromEnv, TODU_DAEMON_PLUGIN_CONFIG_ENV } from "./plugin-config.js";
import { parseDaemonPluginPathsFromEnv, TODU_DAEMON_PLUGIN_PATHS_ENV } from "./plugin-paths.js";
import { startDaemonProcess } from "./process.js";
import { type DaemonRole, isDaemonRole } from "./runtime.js";
import {
  parseAssignedWorkerTypesFromEnv,
  TODU_DAEMON_ASSIGNED_WORKERS_ENV,
} from "./worker-assignment.js";

const TODU_DAEMON_ROLE_ENV = "TODU_DAEMON_ROLE";
const TODU_DAEMON_SOCKET_ENV = "TODU_DAEMON_SOCKET";

function parseDaemonRole(value: string | undefined): DaemonRole {
  if (!value) {
    return "node";
  }

  if (!isDaemonRole(value)) {
    throw new Error(`Invalid ${TODU_DAEMON_ROLE_ENV} value: ${value}. Expected: node or authority`);
  }

  return value;
}

export async function runDaemonEntrypoint(): Promise<void> {
  const daemonLogLevel = resolveDaemonLogLevelFromEnv(process.env);
  const logger = createDaemonLogger({
    component: "daemon.entrypoint",
    level: daemonLogLevel,
  });

  const daemonRole = parseDaemonRole(process.env[TODU_DAEMON_ROLE_ENV]);
  const daemonSocketPath = process.env[TODU_DAEMON_SOCKET_ENV];
  const fileConfig = loadDaemonFileConfig();
  const remoteSync = fileConfig.remoteSync;
  const assignmentConfig = parseAssignedWorkerTypesFromEnv(process.env);
  const pluginPathsConfig = parseDaemonPluginPathsFromEnv(process.env);
  const pluginConfig = parseDaemonPluginConfigFromEnv(process.env);

  if (assignmentConfig.duplicateWorkerTypes.length > 0) {
    logger.warn("duplicate daemon worker assignment entries detected", {
      envVar: TODU_DAEMON_ASSIGNED_WORKERS_ENV,
      duplicateWorkerTypes: assignmentConfig.duplicateWorkerTypes,
    });
  }

  if (assignmentConfig.ignoredEntries.length > 0) {
    logger.warn("ignored empty daemon worker assignment entries", {
      envVar: TODU_DAEMON_ASSIGNED_WORKERS_ENV,
      ignoredEntryCount: assignmentConfig.ignoredEntries.length,
    });
  }

  if (pluginPathsConfig.duplicateModulePaths.length > 0) {
    logger.warn("duplicate daemon plugin path entries detected", {
      envVar: TODU_DAEMON_PLUGIN_PATHS_ENV,
      duplicateModulePaths: pluginPathsConfig.duplicateModulePaths,
    });
  }

  if (pluginPathsConfig.ignoredEntries.length > 0) {
    logger.warn("ignored empty daemon plugin path entries", {
      envVar: TODU_DAEMON_PLUGIN_PATHS_ENV,
      ignoredEntryCount: pluginPathsConfig.ignoredEntries.length,
    });
  }

  if (pluginConfig.parseError) {
    logger.warn("daemon plugin config parse failed", {
      envVar: TODU_DAEMON_PLUGIN_CONFIG_ENV,
      error: pluginConfig.parseError,
    });
  }

  if (pluginConfig.ignoredEntries.length > 0) {
    logger.warn("ignored invalid daemon plugin config entries", {
      envVar: TODU_DAEMON_PLUGIN_CONFIG_ENV,
      ignoredEntryCount: pluginConfig.ignoredEntries.length,
      ignoredEntries: pluginConfig.ignoredEntries,
    });
  }

  const daemon = await startDaemonProcess(
    {
      role: daemonRole,
      socketPath: daemonSocketPath,
      remoteSync: remoteSync ?? undefined,
      bootstrapOwnerActor: fileConfig.bootstrapOwnerActor ?? undefined,
      logLevel: daemonLogLevel,
      assignedWorkerTypes: assignmentConfig.assignedWorkerTypes,
      syncPluginModulePaths: pluginPathsConfig.modulePaths,
      syncPluginConfigs: pluginConfig.pluginConfigs,
    },
    {
      hooks: {
        onStarted: (status) => {
          logger.info("daemon process started", {
            role: status.role,
            socketPath: status.transport?.path ?? "-",
            catalogId: status.catalogId ?? "-",
            assignedWorkerTypes: assignmentConfig.assignedWorkerTypes ?? "all",
            configuredPluginModulePaths: pluginPathsConfig.modulePaths ?? [],
            configuredPluginNames: Object.keys(pluginConfig.pluginConfigs ?? {}),
          });
        },
        onStopping: (reason) => {
          logger.info("daemon process stopping", {
            reason,
          });
        },
        onStopped: () => {
          logger.info("daemon process stopped");
        },
      },
    },
  );

  await daemon.waitForShutdown();
}
