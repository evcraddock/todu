import type { ToduFileConfig } from "@todu/core";

export const TODUAI_DAEMON_PLUGIN_CONFIG_ENV = "TODUAI_DAEMON_PLUGIN_CONFIG";

export interface ResolvedDaemonPluginConfig {
  value: string | undefined;
  source: "env" | "file" | "unset";
}

export function resolveDaemonPluginConfig(
  config: ToduFileConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDaemonPluginConfig {
  const envValue = env[TODUAI_DAEMON_PLUGIN_CONFIG_ENV];
  if (envValue !== undefined) {
    return {
      value: envValue,
      source: "env",
    };
  }

  const pluginConfig = config.daemon?.plugins?.config;
  if (!pluginConfig) {
    return {
      value: undefined,
      source: "unset",
    };
  }

  return {
    value: JSON.stringify(pluginConfig),
    source: "file",
  };
}
