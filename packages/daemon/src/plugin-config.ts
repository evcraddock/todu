export const TODUAI_DAEMON_PLUGIN_CONFIG_ENV = "TODUAI_DAEMON_PLUGIN_CONFIG";

export interface ParsedDaemonPluginConfigEnv {
  pluginConfigs: Record<string, Record<string, unknown>> | undefined;
  parseError?: string;
  ignoredEntries: string[];
}

export function parseDaemonPluginConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ParsedDaemonPluginConfigEnv {
  const rawConfig = env[TODUAI_DAEMON_PLUGIN_CONFIG_ENV];
  if (rawConfig === undefined) {
    return {
      pluginConfigs: undefined,
      ignoredEntries: [],
    };
  }

  if (rawConfig.trim().length === 0) {
    return {
      pluginConfigs: {},
      ignoredEntries: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch (error) {
    return {
      pluginConfigs: {},
      parseError: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ignoredEntries: [],
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      pluginConfigs: {},
      parseError: "plugin config must be a JSON object keyed by plugin name",
      ignoredEntries: [],
    };
  }

  const pluginConfigs: Record<string, Record<string, unknown>> = {};
  const ignoredEntries: string[] = [];

  for (const [pluginName, value] of Object.entries(parsed)) {
    const trimmedName = pluginName.trim();
    if (!trimmedName) {
      ignoredEntries.push(pluginName);
      continue;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      ignoredEntries.push(pluginName);
      continue;
    }

    pluginConfigs[trimmedName] = value as Record<string, unknown>;
  }

  return {
    pluginConfigs,
    ignoredEntries,
  };
}
