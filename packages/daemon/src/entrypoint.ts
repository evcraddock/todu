#!/usr/bin/env node

import { resolveRemoteSyncConfig } from "@todu/core";
import { createDaemonLogger, resolveDaemonLogLevelFromEnv } from "./logger.js";
import { startDaemonProcess } from "./process.js";
import { type DaemonRole, isDaemonRole } from "./runtime.js";
import {
  parseAssignedWorkerTypesFromEnv,
  TODUAI_DAEMON_ASSIGNED_WORKERS_ENV,
} from "./worker-assignment.js";

function parseDaemonRole(value: string | undefined): DaemonRole {
  if (!value) {
    return "node";
  }

  if (!isDaemonRole(value)) {
    throw new Error(`Invalid TODUAI_DAEMON_ROLE: ${value}. Expected: node or authority`);
  }

  return value;
}

export async function runDaemonEntrypoint(): Promise<void> {
  const daemonLogLevel = resolveDaemonLogLevelFromEnv(process.env);
  const logger = createDaemonLogger({
    component: "daemon.entrypoint",
    level: daemonLogLevel,
  });

  const daemonRole = parseDaemonRole(process.env.TODUAI_DAEMON_ROLE);
  const daemonSocketPath = process.env.TODUAI_DAEMON_SOCKET;
  const remoteSync = resolveRemoteSyncConfig({});
  const assignmentConfig = parseAssignedWorkerTypesFromEnv(process.env);

  if (assignmentConfig.duplicateWorkerTypes.length > 0) {
    logger.warn("duplicate daemon worker assignment entries detected", {
      envVar: TODUAI_DAEMON_ASSIGNED_WORKERS_ENV,
      duplicateWorkerTypes: assignmentConfig.duplicateWorkerTypes,
    });
  }

  if (assignmentConfig.ignoredEntries.length > 0) {
    logger.warn("ignored empty daemon worker assignment entries", {
      envVar: TODUAI_DAEMON_ASSIGNED_WORKERS_ENV,
      ignoredEntryCount: assignmentConfig.ignoredEntries.length,
    });
  }

  const daemon = await startDaemonProcess(
    {
      role: daemonRole,
      socketPath: daemonSocketPath,
      remoteSync: remoteSync ?? undefined,
      logLevel: daemonLogLevel,
      assignedWorkerTypes: assignmentConfig.assignedWorkerTypes,
    },
    {
      hooks: {
        onStarted: (status) => {
          logger.info("daemon process started", {
            role: status.role,
            socketPath: status.transport?.path ?? "-",
            catalogId: status.catalogId ?? "-",
            assignedWorkerTypes: assignmentConfig.assignedWorkerTypes ?? "all",
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

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  runDaemonEntrypoint().catch((error: unknown) => {
    const logger = createDaemonLogger({
      component: "daemon.entrypoint",
      level: resolveDaemonLogLevelFromEnv(process.env),
    });

    logger.error("daemon process failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    process.exitCode = 1;
  });
}
