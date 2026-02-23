import path from "node:path";
import { resolveDataDir } from "@todu/core";
import type { Command } from "commander";
import { getConfigPath, loadConfig } from "./config.js";
import type { DaemonTransportResult } from "./daemon-transport.js";
import { invokeDaemonMethod } from "./daemon-transport.js";

export type CliDaemonInvoker = <T>(
  method: string,
  params?: Record<string, unknown>,
) => Promise<DaemonTransportResult<T>>;

export function createCliDaemonInvoker(program: Command): CliDaemonInvoker {
  return async <T>(method: string, params: Record<string, unknown> = {}) => {
    const opts = program.opts<{ config?: string }>();
    const configPath = getConfigPath(opts.config);
    const config = loadConfig(configPath);
    const storagePath = resolveDataDir(configPath, config);

    return invokeDaemonMethod<T>({
      socketPath: resolveDaemonSocketPath(storagePath),
      method,
      params,
    });
  };
}

export function formatDaemonCommandError(error: { code: string; message: string }): string {
  if (error.code === "DAEMON_UNAVAILABLE") {
    return `Error: local daemon is required but unavailable (${error.message}). Start the daemon and retry.`;
  }

  return `Error: ${error.message}`;
}

function resolveDaemonSocketPath(storagePath: string): string {
  const socketOverride = process.env.TODUAI_DAEMON_SOCKET;
  if (socketOverride && socketOverride.trim().length > 0) {
    return path.resolve(socketOverride);
  }

  return path.join(storagePath, "daemon.sock");
}
