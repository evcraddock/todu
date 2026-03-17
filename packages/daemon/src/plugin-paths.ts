export const TODU_DAEMON_PLUGIN_PATHS_ENV = "TODU_DAEMON_PLUGIN_PATHS";
export const TODUAI_DAEMON_PLUGIN_PATHS_ENV = "TODUAI_DAEMON_PLUGIN_PATHS";

export interface ParsedDaemonPluginPathsEnv {
  modulePaths: string[] | undefined;
  duplicateModulePaths: string[];
  ignoredEntries: string[];
}

export function parseDaemonPluginPathsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ParsedDaemonPluginPathsEnv {
  const rawModulePaths = env[TODU_DAEMON_PLUGIN_PATHS_ENV] ?? env[TODUAI_DAEMON_PLUGIN_PATHS_ENV];
  if (rawModulePaths === undefined) {
    return {
      modulePaths: undefined,
      duplicateModulePaths: [],
      ignoredEntries: [],
    };
  }

  if (rawModulePaths.trim().length === 0) {
    return {
      modulePaths: [],
      duplicateModulePaths: [],
      ignoredEntries: [],
    };
  }

  const modulePaths: string[] = [];
  const duplicateModulePaths: string[] = [];
  const ignoredEntries: string[] = [];

  for (const rawEntry of rawModulePaths.split(",")) {
    const modulePath = rawEntry.trim();
    if (!modulePath) {
      ignoredEntries.push(rawEntry);
      continue;
    }

    if (modulePaths.includes(modulePath)) {
      if (!duplicateModulePaths.includes(modulePath)) {
        duplicateModulePaths.push(modulePath);
      }
      continue;
    }

    modulePaths.push(modulePath);
  }

  return {
    modulePaths,
    duplicateModulePaths,
    ignoredEntries,
  };
}
