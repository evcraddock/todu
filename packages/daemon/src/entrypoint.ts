#!/usr/bin/env node

import { createDaemonLogger, resolveDaemonLogLevelFromEnv } from "./logger.js";
import { runDaemonEntrypoint } from "./run-daemon.js";

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
