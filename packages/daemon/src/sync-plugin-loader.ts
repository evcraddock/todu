import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type AnySyncProviderRegistration,
  isSyncProviderRegistrationV2,
  type SyncProviderRegistrationV2,
  type SyncProviderRegistrationV3,
  type SyncProviderValidationError,
  validateSyncProviderRegistration,
  validateWorkerPluginRegistration,
  type WorkerPluginRegistration,
  type WorkerPluginValidationError,
} from "@todu/core";
import {
  createNoopWorkerRuntime,
  type WorkerManifest,
  type WorkerRegistration,
} from "./workers.js";

export const SYNC_PLUGIN_LOAD_ERROR_CODES = [
  "IMPORT_FAILED",
  "INVALID_EXPORT",
  "INVALID_PROVIDER",
  "INVALID_WORKER_PLUGIN",
  "DUPLICATE_WORKER_TYPE",
] as const;

export type SyncPluginLoadErrorCode = (typeof SYNC_PLUGIN_LOAD_ERROR_CODES)[number];

export interface SyncPluginLoadError {
  code: SyncPluginLoadErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface LoadedSyncPluginV2 {
  kind: "sync-provider";
  workerRegistration: WorkerRegistration;
  manifest: SyncProviderRegistrationV2["manifest"];
  provider: SyncProviderRegistrationV2["provider"];
  modulePath: string;
}

export interface LoadedSyncPluginV3 {
  kind: "sync-provider";
  workerRegistration: WorkerRegistration;
  manifest: SyncProviderRegistrationV3["manifest"];
  provider: SyncProviderRegistrationV3["provider"];
  modulePath: string;
}

export type LoadedSyncPlugin = LoadedSyncPluginV2 | LoadedSyncPluginV3;

export interface LoadedWorkerPlugin {
  kind: "worker-plugin";
  workerRegistration: WorkerRegistration;
  manifest: WorkerPluginRegistration["manifest"];
  createRuntime: WorkerPluginRegistration["createRuntime"];
  modulePath: string;
}

export type LoadedConfiguredPlugin = LoadedSyncPlugin | LoadedWorkerPlugin;

export function isLoadedSyncPluginV2(plugin: LoadedSyncPlugin): plugin is LoadedSyncPluginV2 {
  return plugin.manifest.apiVersion === 2;
}

export function isLoadedSyncPluginV3(plugin: LoadedSyncPlugin): plugin is LoadedSyncPluginV3 {
  return plugin.manifest.apiVersion === 3;
}

export interface LoadConfiguredPluginsResult {
  loadedPlugins: LoadedConfiguredPlugin[];
  failures: SyncPluginLoadError[];
}

export interface LoadConfiguredPluginsOptions {
  modulePaths: string[];
  importModule?: (specifier: string) => Promise<unknown>;
}

interface SyncPluginModuleShape {
  default?: unknown;
  syncProvider?: unknown;
  workerPlugin?: unknown;
}

export async function loadConfiguredPlugins(
  options: LoadConfiguredPluginsOptions,
): Promise<LoadConfiguredPluginsResult> {
  const importModule = options.importModule ?? ((specifier) => import(specifier));
  const loadedPlugins: LoadedConfiguredPlugin[] = [];
  const failures: SyncPluginLoadError[] = [];
  const seenWorkerTypes = new Set<string>();

  for (const modulePath of options.modulePaths) {
    const importSpecifier = resolveSyncPluginImportSpecifier(modulePath);

    let moduleExports: unknown;
    try {
      moduleExports = await importModule(importSpecifier);
    } catch (error) {
      failures.push({
        code: "IMPORT_FAILED",
        message: `Failed to import plugin module: ${modulePath}`,
        details: {
          modulePath,
          importSpecifier,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      continue;
    }

    const workerPluginCandidate = extractWorkerPluginRegistration(moduleExports);
    if (workerPluginCandidate) {
      const workerValidation = validateWorkerPluginRegistration(workerPluginCandidate);
      if (!workerValidation.ok) {
        failures.push(createInvalidWorkerPluginError(modulePath, workerValidation.error));
        continue;
      }

      const workerManifest = createWorkerManifestFromWorkerPlugin(workerValidation.value.manifest);
      if (seenWorkerTypes.has(workerManifest.type)) {
        failures.push({
          code: "DUPLICATE_WORKER_TYPE",
          message: `Plugin worker type collision: ${workerManifest.type}`,
          details: {
            modulePath,
            workerType: workerManifest.type,
            pluginName: workerValidation.value.manifest.name,
          },
        });
        continue;
      }

      seenWorkerTypes.add(workerManifest.type);

      loadedPlugins.push({
        kind: "worker-plugin",
        modulePath,
        manifest: workerValidation.value.manifest,
        createRuntime: workerValidation.value.createRuntime,
        workerRegistration: {
          manifest: workerManifest,
          runtime: createNoopWorkerRuntime(),
        },
      });
      continue;
    }

    const syncRegistrationCandidate = extractSyncProviderRegistration(moduleExports);
    if (!syncRegistrationCandidate) {
      failures.push({
        code: "INVALID_EXPORT",
        message: `Plugin module must export workerPlugin, syncProvider, or default registration: ${modulePath}`,
        details: {
          modulePath,
          exportNames: Object.keys((moduleExports ?? {}) as Record<string, unknown>),
        },
      });
      continue;
    }

    const syncValidation = validateSyncProviderRegistration(syncRegistrationCandidate);
    if (!syncValidation.ok) {
      failures.push(createInvalidProviderError(modulePath, syncValidation.error));
      continue;
    }

    const workerType = createSyncPluginWorkerType(syncValidation.value.manifest.name);
    if (seenWorkerTypes.has(workerType)) {
      failures.push({
        code: "DUPLICATE_WORKER_TYPE",
        message: `Plugin worker type collision: ${workerType}`,
        details: {
          modulePath,
          workerType,
          pluginName: syncValidation.value.manifest.name,
        },
      });
      continue;
    }

    seenWorkerTypes.add(workerType);

    loadedPlugins.push(
      isSyncProviderRegistrationV2(syncValidation.value)
        ? {
            kind: "sync-provider",
            modulePath,
            manifest: syncValidation.value.manifest,
            provider: syncValidation.value.provider,
            workerRegistration: {
              manifest: createSyncPluginWorkerManifest(workerType),
              runtime: createNoopWorkerRuntime(),
            },
          }
        : {
            kind: "sync-provider",
            modulePath,
            manifest: syncValidation.value.manifest,
            provider: syncValidation.value.provider,
            workerRegistration: {
              manifest: createSyncPluginWorkerManifest(workerType),
              runtime: createNoopWorkerRuntime(),
            },
          },
    );
  }

  return {
    loadedPlugins,
    failures,
  };
}

export async function loadConfiguredSyncPlugins(
  options: LoadConfiguredPluginsOptions,
): Promise<LoadConfiguredPluginsResult> {
  return loadConfiguredPlugins(options);
}

function createInvalidProviderError(
  modulePath: string,
  validationError: SyncProviderValidationError,
): SyncPluginLoadError {
  return {
    code: "INVALID_PROVIDER",
    message: `Invalid sync provider registration: ${modulePath}`,
    details: {
      modulePath,
      validationError,
    },
  };
}

function createInvalidWorkerPluginError(
  modulePath: string,
  validationError: WorkerPluginValidationError,
): SyncPluginLoadError {
  return {
    code: "INVALID_WORKER_PLUGIN",
    message: `Invalid worker plugin registration: ${modulePath}`,
    details: {
      modulePath,
      validationError,
    },
  };
}

function extractSyncProviderRegistration(
  moduleExports: unknown,
): AnySyncProviderRegistration | null {
  if (!moduleExports || typeof moduleExports !== "object") {
    return null;
  }

  const moduleShape = moduleExports as SyncPluginModuleShape;
  const candidate = moduleShape.syncProvider ?? moduleShape.default;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as AnySyncProviderRegistration;
}

function extractWorkerPluginRegistration(moduleExports: unknown): WorkerPluginRegistration | null {
  if (!moduleExports || typeof moduleExports !== "object") {
    return null;
  }

  const moduleShape = moduleExports as SyncPluginModuleShape;
  const candidate = moduleShape.workerPlugin;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as WorkerPluginRegistration;
}

function createSyncPluginWorkerManifest(workerType: string): WorkerManifest {
  return {
    type: workerType,
    requiredDomains: ["sync", "task"],
    roleHints: ["node"],
  };
}

function createWorkerManifestFromWorkerPlugin(
  manifest: WorkerPluginRegistration["manifest"],
): WorkerManifest {
  return {
    type: manifest.worker.type,
    requiredDomains: [...manifest.worker.requiredDomains],
    optionalDomains: [...(manifest.worker.optionalDomains ?? [])],
    roleHints: [...(manifest.worker.roleHints ?? [])],
  };
}

function createSyncPluginWorkerType(pluginName: string): string {
  const normalizedName = pluginName
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, "-");
  const workerTypeBase = normalizedName.endsWith("-sync")
    ? normalizedName
    : `${normalizedName}-sync`;
  return workerTypeBase;
}

function resolveSyncPluginImportSpecifier(modulePath: string): string {
  if (path.isAbsolute(modulePath) || modulePath.startsWith(".")) {
    const absolutePath = path.resolve(modulePath);
    return pathToFileURL(absolutePath).href;
  }

  return modulePath;
}
