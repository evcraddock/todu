import path from "node:path";
import type { ToduFileConfig } from "@todu/core";

export const TODUAI_DAEMON_PLUGIN_PATHS_ENV = "TODUAI_DAEMON_PLUGIN_PATHS";

export interface ResolvedDaemonPluginPaths {
  value: string | undefined;
  source: "env" | "file" | "unset";
}

export function resolveDaemonPluginPaths(
  configPath: string,
  config: ToduFileConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDaemonPluginPaths {
  const envValue = env[TODUAI_DAEMON_PLUGIN_PATHS_ENV];
  if (envValue !== undefined) {
    return {
      value: envValue,
      source: "env",
    };
  }

  const filePluginPaths = config.daemon?.plugins?.paths;
  if (!filePluginPaths) {
    return {
      value: undefined,
      source: "unset",
    };
  }

  const configDir = path.dirname(configPath);
  const normalizedPaths = filePluginPaths
    .map((pluginPath) => pluginPath.trim())
    .filter((pluginPath) => pluginPath.length > 0)
    .map((pluginPath) => path.resolve(configDir, pluginPath));

  return {
    value: normalizedPaths.join(","),
    source: "file",
  };
}
