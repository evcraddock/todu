#!/usr/bin/env node

import { resolveRemoteSyncConfig } from "@todu/core";
import { startDaemonProcess } from "./process.js";
import { type DaemonRole, isDaemonRole } from "./runtime.js";

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
  const daemonRole = parseDaemonRole(process.env.TODUAI_DAEMON_ROLE);
  const daemonSocketPath = process.env.TODUAI_DAEMON_SOCKET;
  const remoteSync = resolveRemoteSyncConfig({});

  const daemon = await startDaemonProcess(
    {
      role: daemonRole,
      socketPath: daemonSocketPath,
      remoteSync: remoteSync ?? undefined,
    },
    {
      hooks: {
        onStarted: (status) => {
          console.log(
            `[daemon] running role=${status.role} socket=${status.transport?.path ?? "-"} catalog=${status.catalogId ?? "-"}`,
          );
        },
        onStopping: (reason) => {
          console.log(`[daemon] stopping (${reason})`);
        },
        onStopped: () => {
          console.log("[daemon] stopped");
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
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daemon] failed: ${message}`);
    process.exitCode = 1;
  });
}
