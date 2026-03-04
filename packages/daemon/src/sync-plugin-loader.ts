import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type SyncProviderRegistration,
  type SyncProviderValidationError,
  validateSyncProviderRegistration,
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
  "DUPLICATE_WORKER_TYPE",
] as const;

export type SyncPluginLoadErrorCode = (typeof SYNC_PLUGIN_LOAD_ERROR_CODES)[number];

export interface SyncPluginLoadError {
  code: SyncPluginLoadErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface LoadedSyncPlugin {
  workerRegistration: WorkerRegistration;
  manifest: SyncProviderRegistration["manifest"];
  modulePath: string;
}

export interface LoadConfiguredSyncPluginsResult {
  loadedPlugins: LoadedSyncPlugin[];
  failures: SyncPluginLoadError[];
}

export interface LoadConfiguredSyncPluginsOptions {
  modulePaths: string[];
  importModule?: (specifier: string) => Promise<unknown>;
}

interface SyncPluginModuleShape {
  default?: unknown;
  syncProvider?: unknown;
}

export async function loadConfiguredSyncPlugins(
  options: LoadConfiguredSyncPluginsOptions,
): Promise<LoadConfiguredSyncPluginsResult> {
  const importModule = options.importModule ?? ((specifier) => import(specifier));
  const loadedPlugins: LoadedSyncPlugin[] = [];
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
        message: `Failed to import sync plugin module: ${modulePath}`,
        details: {
          modulePath,
          importSpecifier,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      continue;
    }

    const registrationCandidate = extractSyncProviderRegistration(moduleExports);
    if (!registrationCandidate) {
      failures.push({
        code: "INVALID_EXPORT",
        message: `Sync plugin module must export syncProvider or default registration: ${modulePath}`,
        details: {
          modulePath,
          exportNames: Object.keys((moduleExports ?? {}) as Record<string, unknown>),
        },
      });
      continue;
    }

    const validation = validateSyncProviderRegistration(registrationCandidate);
    if (!validation.ok) {
      failures.push(createInvalidProviderError(modulePath, validation.error));
      continue;
    }

    const workerType = createSyncPluginWorkerType(validation.value.manifest.name);
    if (seenWorkerTypes.has(workerType)) {
      failures.push({
        code: "DUPLICATE_WORKER_TYPE",
        message: `Sync plugin worker type collision: ${workerType}`,
        details: {
          modulePath,
          workerType,
          pluginName: validation.value.manifest.name,
        },
      });
      continue;
    }

    seenWorkerTypes.add(workerType);

    loadedPlugins.push({
      modulePath,
      manifest: validation.value.manifest,
      workerRegistration: {
        manifest: createSyncPluginWorkerManifest(workerType),
        runtime: createNoopWorkerRuntime(),
      },
    });
  }

  return {
    loadedPlugins,
    failures,
  };
}

function createInvalidProviderError(
  modulePath: string,
  validationError: SyncProviderValidationError,
): SyncPluginLoadError {
  return {
    code: "INVALID_PROVIDER",
    message: `Invalid sync plugin provider registration: ${modulePath}`,
    details: {
      modulePath,
      validationError,
    },
  };
}

function extractSyncProviderRegistration(moduleExports: unknown): SyncProviderRegistration | null {
  if (!moduleExports || typeof moduleExports !== "object") {
    return null;
  }

  const moduleShape = moduleExports as SyncPluginModuleShape;
  const candidate = moduleShape.syncProvider ?? moduleShape.default;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as SyncProviderRegistration;
}

function createSyncPluginWorkerManifest(workerType: string): WorkerManifest {
  return {
    type: workerType,
    requiredDomains: ["sync", "task"],
    roleHints: ["node"],
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
