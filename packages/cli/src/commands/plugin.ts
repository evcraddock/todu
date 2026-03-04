import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type SyncProviderManifest,
  type SyncProviderRegistration,
  type ToduFileConfig,
  validateSyncProviderRegistration,
} from "@todu/core";
import type { Command } from "commander";
import { getConfigPath, loadConfig, saveConfig } from "../config.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON, formatTable } from "../format.js";

const PLUGIN_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "version", label: "Version" },
  { key: "runtime", label: "Runtime" },
  { key: "modulePath", label: "Module" },
  { key: "status", label: "Status" },
] as const;

interface WorkerStatusResult {
  workers: Array<{
    type: string;
    state: string;
  }>;
}

interface PluginListItem {
  modulePath: string;
  manifest: SyncProviderManifest | null;
  workerType: string | null;
  status: "ok" | "error";
  errorCode?: string;
  errorMessage?: string;
}

interface InspectPluginSuccess {
  ok: true;
  modulePath: string;
  manifest: SyncProviderManifest;
}

interface InspectPluginFailure {
  ok: false;
  modulePath: string;
  code: "IMPORT_FAILED" | "INVALID_EXPORT" | "INVALID_PROVIDER";
  message: string;
}

type InspectPluginResult = InspectPluginSuccess | InspectPluginFailure;

interface RuntimeLookupResult {
  available: boolean;
  statesByWorkerType: Map<string, string>;
}

interface PluginConfigCommandResult {
  plugin: string;
  settings: Record<string, unknown>;
}

interface PluginModuleShape {
  default?: unknown;
  syncProvider?: unknown;
}

export function registerPluginCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const plugin = program.command("plugin").description("Manage sync plugins");

  plugin
    .command("install <modulePath>")
    .description("Install a plugin by adding its module path to daemon config")
    .action(async (modulePath: string) => {
      const normalizedModulePath = normalizeConfiguredModulePath(modulePath);
      const inspectedPlugin = await inspectPluginModule(normalizedModulePath);
      if (!inspectedPlugin.ok) {
        console.error(`Error: ${inspectedPlugin.message}`);
        process.exitCode = 1;
        return;
      }

      const configPath = getConfigPath(program.opts().config as string | undefined);
      const config = loadConfig(configPath);
      const configuredPaths = readConfiguredPluginPaths(config);

      const alreadyConfigured = configuredPaths.includes(normalizedModulePath);
      if (!alreadyConfigured) {
        const updatedPaths = [...configuredPaths, normalizedModulePath];
        writeConfiguredPluginPaths(config, updatedPaths);
        saveConfig(config, configPath);
      }

      const daemonRunning = await isDaemonRunning(invokeDaemon);

      const output = {
        installed: !alreadyConfigured,
        plugin: {
          name: inspectedPlugin.manifest.name,
          version: inspectedPlugin.manifest.version,
          apiVersion: inspectedPlugin.manifest.apiVersion,
          modulePath: normalizedModulePath,
        },
        daemonRestartRequired: daemonRunning,
      };

      if (program.opts().format === "json") {
        console.log(formatJSON(output));
        return;
      }

      if (alreadyConfigured) {
        console.log(
          `Plugin already installed: ${inspectedPlugin.manifest.name}@${inspectedPlugin.manifest.version}`,
        );
      } else {
        console.log(
          `Plugin installed: ${inspectedPlugin.manifest.name}@${inspectedPlugin.manifest.version}`,
        );
      }
      console.log(`Module: ${normalizedModulePath}`);
      if (daemonRunning) {
        console.log("Daemon restart required for activation.");
      }
    });

  plugin
    .command("list")
    .description("List configured plugins")
    .action(async () => {
      const configPath = getConfigPath(program.opts().config as string | undefined);
      const config = loadConfig(configPath);
      const configuredPaths = readConfiguredPluginPaths(config);

      if (configuredPaths.length === 0) {
        if (program.opts().format === "json") {
          console.log(formatJSON([]));
        } else {
          console.log("No plugins configured.");
        }
        return;
      }

      const inspectedPlugins = await Promise.all(
        configuredPaths.map((configuredPath) => inspectPluginModule(configuredPath)),
      );
      const runtimeLookupResult = await loadWorkerRuntimeStates(invokeDaemon);
      if (!runtimeLookupResult.ok) {
        console.error(formatDaemonCommandError(runtimeLookupResult.error));
        process.exitCode = 1;
        return;
      }

      const runtimeLookup = runtimeLookupResult.value;

      const items = inspectedPlugins.map<PluginListItem>((inspectedPlugin) => {
        if (!inspectedPlugin.ok) {
          return {
            modulePath: inspectedPlugin.modulePath,
            manifest: null,
            workerType: null,
            status: "error",
            errorCode: inspectedPlugin.code,
            errorMessage: inspectedPlugin.message,
          };
        }

        return {
          modulePath: inspectedPlugin.modulePath,
          manifest: inspectedPlugin.manifest,
          workerType: createSyncPluginWorkerType(inspectedPlugin.manifest.name),
          status: "ok",
        };
      });

      if (program.opts().format === "json") {
        console.log(
          formatJSON(
            items.map((item) => ({
              modulePath: item.modulePath,
              manifest: item.manifest,
              workerType: item.workerType,
              runtimeState: resolveRuntimeState(item, runtimeLookup),
              status: item.status,
              errorCode: item.errorCode,
              errorMessage: item.errorMessage,
            })),
          ),
        );
        return;
      }

      const rows = items.map((item) => {
        const runtimeState = resolveRuntimeState(item, runtimeLookup);
        return {
          name: item.manifest?.name ?? "(unresolved)",
          version: item.manifest?.version ?? "-",
          runtime: runtimeState,
          modulePath: item.modulePath,
          status: item.status === "ok" ? "ok" : `${item.errorCode}: ${item.errorMessage}`,
        };
      });

      console.log(formatTable(rows, [...PLUGIN_COLUMNS]));
      if (!runtimeLookup.available) {
        console.log("\nRuntime status unavailable (daemon not running).");
      }
    });

  plugin
    .command("remove <pluginRef>")
    .description("Remove a plugin from daemon config by name or module path")
    .action(async (pluginRef: string) => {
      const configPath = getConfigPath(program.opts().config as string | undefined);
      const config = loadConfig(configPath);
      const configuredPaths = readConfiguredPluginPaths(config);

      if (configuredPaths.length === 0) {
        console.error(`Error: Plugin not found: ${pluginRef}`);
        process.exitCode = 1;
        return;
      }

      const inspectedPlugins = await Promise.all(
        configuredPaths.map((configuredPath) => inspectPluginModule(configuredPath)),
      );

      const matches = findMatchingPluginIndexes(pluginRef, configuredPaths, inspectedPlugins);
      if (matches.length === 0) {
        console.error(`Error: Plugin not found: ${pluginRef}`);
        process.exitCode = 1;
        return;
      }

      const updatedPaths = configuredPaths.filter((_, index) => !matches.includes(index));
      writeConfiguredPluginPaths(config, updatedPaths);
      saveConfig(config, configPath);

      const removedItems = matches.map((index) => {
        const inspectedPlugin = inspectedPlugins[index];
        return {
          modulePath: configuredPaths[index],
          name: inspectedPlugin.ok ? inspectedPlugin.manifest.name : null,
          version: inspectedPlugin.ok ? inspectedPlugin.manifest.version : null,
        };
      });

      const daemonRunning = await isDaemonRunning(invokeDaemon);

      if (program.opts().format === "json") {
        console.log(
          formatJSON({
            removed: removedItems,
            daemonRestartRequired: daemonRunning,
          }),
        );
        return;
      }

      for (const removedItem of removedItems) {
        if (removedItem.name && removedItem.version) {
          console.log(`Removed plugin: ${removedItem.name}@${removedItem.version}`);
        } else {
          console.log(`Removed plugin path: ${removedItem.modulePath}`);
        }
      }

      if (daemonRunning) {
        console.log("Daemon restart required for removal to take effect.");
      }
    });

  plugin
    .command("config <pluginRef>")
    .description("Show or update plugin config settings")
    .option("--set <json>", "replace plugin config object with JSON")
    .option("--clear", "clear saved plugin config")
    .action(async (pluginRef: string, options: { set?: string; clear?: boolean }) => {
      if (options.set && options.clear) {
        console.error("Error: --set and --clear cannot be used together");
        process.exitCode = 1;
        return;
      }

      const configPath = getConfigPath(program.opts().config as string | undefined);
      const config = loadConfig(configPath);
      const configuredPaths = readConfiguredPluginPaths(config);
      const inspectedPlugins = await Promise.all(
        configuredPaths.map((configuredPath) => inspectPluginModule(configuredPath)),
      );

      const resolvedPlugin = resolveConfiguredPlugin(pluginRef, configuredPaths, inspectedPlugins);
      if (!resolvedPlugin.ok) {
        console.error(`Error: ${resolvedPlugin.message}`);
        process.exitCode = 1;
        return;
      }

      const existingConfig = readPluginSettings(config, resolvedPlugin.pluginName);

      if (!options.set && !options.clear) {
        const result: PluginConfigCommandResult = {
          plugin: resolvedPlugin.pluginName,
          settings: existingConfig,
        };

        if (program.opts().format === "json") {
          console.log(formatJSON(result));
        } else {
          console.log(`Plugin: ${resolvedPlugin.pluginName}`);
          console.log(`Config: ${formatJSON(existingConfig)}`);
        }
        return;
      }

      if (options.clear) {
        writePluginSettings(config, resolvedPlugin.pluginName, null);
        saveConfig(config, configPath);

        const result: PluginConfigCommandResult = {
          plugin: resolvedPlugin.pluginName,
          settings: {},
        };

        if (program.opts().format === "json") {
          console.log(formatJSON(result));
        } else {
          console.log(`Plugin config cleared: ${resolvedPlugin.pluginName}`);
        }
        return;
      }

      const parsedConfig = parsePluginSettingsJson(options.set ?? "");
      if (!parsedConfig.ok) {
        console.error(`Error: ${parsedConfig.message}`);
        process.exitCode = 1;
        return;
      }

      writePluginSettings(config, resolvedPlugin.pluginName, parsedConfig.value);
      saveConfig(config, configPath);

      const result: PluginConfigCommandResult = {
        plugin: resolvedPlugin.pluginName,
        settings: parsedConfig.value,
      };

      if (program.opts().format === "json") {
        console.log(formatJSON(result));
      } else {
        console.log(`Plugin config updated: ${resolvedPlugin.pluginName}`);
        console.log(`Config: ${formatJSON(parsedConfig.value)}`);
      }
    });
}

function readConfiguredPluginPaths(config: ToduFileConfig): string[] {
  const paths = config.daemon?.plugins?.paths;
  if (!paths) {
    return [];
  }

  return paths.map((pluginPath) => pluginPath.trim()).filter((pluginPath) => pluginPath.length > 0);
}

function writeConfiguredPluginPaths(config: ToduFileConfig, paths: string[]): void {
  const normalizedPaths = paths
    .map((pluginPath) => pluginPath.trim())
    .filter((pluginPath) => pluginPath.length > 0);

  config.daemon ??= {};
  config.daemon.plugins ??= {};
  config.daemon.plugins.paths = normalizedPaths;
}

function readPluginSettings(config: ToduFileConfig, pluginName: string): Record<string, unknown> {
  const rawConfig = config.daemon?.plugins?.config?.[pluginName];

  if (!isRecord(rawConfig)) {
    return {};
  }

  return { ...rawConfig };
}

function writePluginSettings(
  config: ToduFileConfig,
  pluginName: string,
  settings: Record<string, unknown> | null,
): void {
  config.daemon ??= {};
  config.daemon.plugins ??= {};
  config.daemon.plugins.config ??= {};

  if (!settings || Object.keys(settings).length === 0) {
    delete config.daemon.plugins.config[pluginName];
    return;
  }

  config.daemon.plugins.config[pluginName] = { ...settings };
}

function normalizeConfiguredModulePath(modulePath: string): string {
  const trimmedModulePath = modulePath.trim();
  if (trimmedModulePath.length === 0) {
    return trimmedModulePath;
  }

  if (path.isAbsolute(trimmedModulePath) || trimmedModulePath.startsWith(".")) {
    return path.resolve(trimmedModulePath);
  }

  return trimmedModulePath;
}

function toModuleImportSpecifier(modulePath: string): string {
  if (path.isAbsolute(modulePath) || modulePath.startsWith(".")) {
    return pathToFileURL(path.resolve(modulePath)).href;
  }

  return modulePath;
}

async function inspectPluginModule(modulePath: string): Promise<InspectPluginResult> {
  const importSpecifier = toModuleImportSpecifier(modulePath);

  let moduleExports: unknown;
  try {
    moduleExports = await import(importSpecifier);
  } catch (error) {
    return {
      ok: false,
      modulePath,
      code: "IMPORT_FAILED",
      message: `failed to import module (${modulePath}): ${stringifyUnknownError(error)}`,
    };
  }

  const registrationCandidate = extractSyncProviderRegistration(moduleExports);
  if (!registrationCandidate) {
    return {
      ok: false,
      modulePath,
      code: "INVALID_EXPORT",
      message: `module must export syncProvider or default registration (${modulePath})`,
    };
  }

  const validation = validateSyncProviderRegistration(registrationCandidate);
  if (!validation.ok) {
    return {
      ok: false,
      modulePath,
      code: "INVALID_PROVIDER",
      message: `${validation.error.code}: ${validation.error.message}`,
    };
  }

  return {
    ok: true,
    modulePath,
    manifest: validation.value.manifest,
  };
}

function extractSyncProviderRegistration(moduleExports: unknown): SyncProviderRegistration | null {
  if (!isRecord(moduleExports)) {
    return null;
  }

  const moduleShape = moduleExports as PluginModuleShape;
  const registrationCandidate = moduleShape.syncProvider ?? moduleShape.default;

  if (!isRecord(registrationCandidate)) {
    return null;
  }

  return registrationCandidate as unknown as SyncProviderRegistration;
}

async function isDaemonRunning(invokeDaemon: CliDaemonInvoker): Promise<boolean> {
  const status = await invokeDaemon<{ state: string; healthy: boolean }>("daemon.status", {});
  if (!status.ok) {
    return false;
  }

  return status.value.state === "running" && status.value.healthy;
}

async function loadWorkerRuntimeStates(invokeDaemon: CliDaemonInvoker): Promise<
  | { ok: true; value: RuntimeLookupResult }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    }
> {
  const result = await invokeDaemon<WorkerStatusResult>("worker.status", {});
  if (!result.ok) {
    if (result.error.code === "DAEMON_UNAVAILABLE") {
      return {
        ok: true,
        value: {
          available: false,
          statesByWorkerType: new Map(),
        },
      };
    }

    return {
      ok: false,
      error: result.error,
    };
  }

  const statesByWorkerType = new Map<string, string>();
  for (const worker of result.value.workers) {
    statesByWorkerType.set(worker.type, worker.state);
  }

  return {
    ok: true,
    value: {
      available: true,
      statesByWorkerType,
    },
  };
}

function resolveRuntimeState(item: PluginListItem, runtimeLookup: RuntimeLookupResult): string {
  if (!runtimeLookup.available) {
    return "daemon-unavailable";
  }

  if (!item.workerType) {
    return "-";
  }

  return runtimeLookup.statesByWorkerType.get(item.workerType) ?? "not-loaded";
}

function createSyncPluginWorkerType(pluginName: string): string {
  const normalizedName = pluginName
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, "-");

  return normalizedName.endsWith("-sync") ? normalizedName : `${normalizedName}-sync`;
}

function findMatchingPluginIndexes(
  pluginRef: string,
  configuredPaths: string[],
  inspectedPlugins: InspectPluginResult[],
): number[] {
  const normalizedRef = pluginRef.trim().toLowerCase();
  const normalizedPathRef = normalizeConfiguredModulePath(pluginRef).toLowerCase();

  const matches: number[] = [];

  for (let index = 0; index < configuredPaths.length; index += 1) {
    const configuredPath = configuredPaths[index];
    const inspectedPlugin = inspectedPlugins[index];

    const matchesByPath =
      configuredPath.toLowerCase() === normalizedRef ||
      configuredPath.toLowerCase() === normalizedPathRef;

    const matchesByName =
      inspectedPlugin.ok && inspectedPlugin.manifest.name.toLowerCase() === normalizedRef;

    if (matchesByPath || matchesByName) {
      matches.push(index);
    }
  }

  return matches;
}

function resolveConfiguredPlugin(
  pluginRef: string,
  configuredPaths: string[],
  inspectedPlugins: InspectPluginResult[],
): { ok: true; pluginName: string } | { ok: false; message: string } {
  const matches = findMatchingPluginIndexes(pluginRef, configuredPaths, inspectedPlugins);
  if (matches.length === 0) {
    return {
      ok: false,
      message: `plugin not found: ${pluginRef}`,
    };
  }

  const validMatches = matches.filter((index) => inspectedPlugins[index]?.ok);
  if (validMatches.length === 0) {
    return {
      ok: false,
      message: "plugin exists but registration is invalid; fix plugin install before configuring",
    };
  }

  const pluginNames = Array.from(
    new Set(
      validMatches
        .map((index) => inspectedPlugins[index])
        .filter((plugin): plugin is InspectPluginSuccess => plugin.ok)
        .map((plugin) => plugin.manifest.name),
    ),
  );

  if (pluginNames.length !== 1) {
    return {
      ok: false,
      message: `plugin reference is ambiguous: ${pluginRef}`,
    };
  }

  return {
    ok: true,
    pluginName: pluginNames[0],
  };
}

function parsePluginSettingsJson(
  value: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return {
      ok: false,
      message: "plugin config JSON cannot be empty",
    };
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(trimmedValue);
  } catch (error) {
    return {
      ok: false,
      message: `invalid JSON config: ${stringifyUnknownError(error)}`,
    };
  }

  if (!isRecord(parsedValue)) {
    return {
      ok: false,
      message: "plugin config must be a JSON object",
    };
  }

  return {
    ok: true,
    value: parsedValue,
  };
}

function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
