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

export function formatDaemonCommandError(error: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): string {
  if (error.code === "DAEMON_UNAVAILABLE") {
    return `Error: local daemon is required but unavailable (${error.message}). Start the daemon and retry.`;
  }

  if (error.code === "JOIN_FAILED") {
    return formatJoinFailedError(error);
  }

  return `Error: ${error.message}`;
}

function formatJoinFailedError(error: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): string {
  const stage = stringDetail(error.details, "stage");
  const previousCatalogId = stringDetail(error.details, "previousCatalogId");
  const targetCatalogId = stringDetail(error.details, "targetCatalogId");
  const cause =
    stringDetail(error.details, "cause") ??
    stringDetail(error.details, "switchError") ??
    stringDetail(error.details, "restoreError");

  const contextParts = [
    stage ? `stage=${stage}` : null,
    previousCatalogId ? `previous=${previousCatalogId}` : null,
    targetCatalogId ? `target=${targetCatalogId}` : null,
  ].filter((value): value is string => value !== null);

  const context = contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";
  const causeText = cause ? ` Cause: ${cause}` : "";

  return `Error: ${error.message}${context}${causeText}`;
}

function stringDetail(details: Record<string, unknown> | undefined, key: string): string | null {
  const value = details?.[key];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value;
}

export function resolveDaemonSocketPath(storagePath: string): string {
  const socketOverride = process.env.TODU_DAEMON_SOCKET ?? process.env.TODUAI_DAEMON_SOCKET;
  if (socketOverride && socketOverride.trim().length > 0) {
    return path.resolve(socketOverride);
  }

  return path.join(storagePath, "daemon.sock");
}
