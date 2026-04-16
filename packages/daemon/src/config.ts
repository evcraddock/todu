import fs from "node:fs";
import {
  type BootstrapOwnerActor,
  normalizeConfigPaths,
  type RemoteSyncConfig,
  resolveBootstrapOwnerActor,
  resolveConfigPath,
  resolveRemoteSyncConfig,
  type ToduFileConfig,
} from "@todu/core";
import { parse } from "yaml";

export interface DaemonFileConfig {
  fileConfig: ToduFileConfig;
  remoteSync: RemoteSyncConfig | null;
  bootstrapOwnerActor: BootstrapOwnerActor | null;
}

/**
 * Load daemon file config from the standard resolved config path.
 *
 * Returns defaults when the file is missing or unreadable.
 * Throws when YAML is malformed or bootstrap owner config is invalid.
 */
export function loadDaemonFileConfig(): DaemonFileConfig {
  const configPath = resolveConfigPath();

  let fileConfig: ToduFileConfig = {};
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    fileConfig = normalizeConfigPaths((parse(content) as ToduFileConfig) ?? {}, configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const bootstrapOwnerActor = resolveBootstrapOwnerActor(fileConfig);
  if (!bootstrapOwnerActor.ok) {
    throw new Error(
      `Invalid bootstrap owner actor config (${bootstrapOwnerActor.error.field}): ${bootstrapOwnerActor.error.message}`,
    );
  }

  return {
    fileConfig,
    remoteSync: resolveRemoteSyncConfig(fileConfig),
    bootstrapOwnerActor: bootstrapOwnerActor.value,
  };
}
