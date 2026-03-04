import { err, ok, type Project, type Result, type SyncStrategy, type Task } from "./types.js";

export const SYNC_PROVIDER_API_VERSION = 1 as const;

export const SYNC_CONFLICT_RESOLUTION_POLICIES = ["last-write-wins"] as const;
export type SyncConflictResolutionPolicy = (typeof SYNC_CONFLICT_RESOLUTION_POLICIES)[number];

export interface SyncProviderManifest {
  name: string;
  version: string;
  apiVersion: number;
}

export interface ExternalTask {
  externalId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  labels?: string[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

export interface ExternalComment {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: string;
  createdAt: string;
  updatedAt?: string;
  raw?: unknown;
}

export interface SyncProviderConfig {
  projectId: string;
  strategy: SyncStrategy;
  settings: Record<string, unknown>;
}

export interface SyncProviderPullResult {
  tasks: ExternalTask[];
  comments?: ExternalComment[];
}

export interface SyncProvider {
  readonly name: string;
  readonly version: string;
  initialize(config: SyncProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  pull(project: Project): Promise<SyncProviderPullResult>;
  push(tasks: Task[], project: Project): Promise<void>;
  mapToTask(external: ExternalTask, project: Project): Task;
  mapFromTask(task: Task, project: Project): ExternalTask;
}

export interface SyncProviderRegistration {
  manifest: SyncProviderManifest;
  provider: SyncProvider;
}

export const SYNC_PROVIDER_VALIDATION_ERROR_CODES = [
  "INVALID_MANIFEST",
  "INVALID_PROVIDER",
  "API_VERSION_MISMATCH",
  "IDENTITY_MISMATCH",
] as const;

export type SyncProviderValidationErrorCode = (typeof SYNC_PROVIDER_VALIDATION_ERROR_CODES)[number];

export interface SyncProviderValidationError {
  code: SyncProviderValidationErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidateSyncProviderRegistrationOptions {
  supportedApiVersion?: number;
}

const REQUIRED_SYNC_PROVIDER_METHODS = [
  "initialize",
  "shutdown",
  "pull",
  "push",
  "mapToTask",
  "mapFromTask",
] as const;

export function isSyncProviderApiVersionCompatible(
  providerApiVersion: number,
  supportedApiVersion: number = SYNC_PROVIDER_API_VERSION,
): boolean {
  return Number.isInteger(providerApiVersion) && providerApiVersion === supportedApiVersion;
}

export function validateSyncProviderRegistration(
  registration: SyncProviderRegistration,
  options: ValidateSyncProviderRegistrationOptions = {},
): Result<SyncProviderRegistration, SyncProviderValidationError> {
  const supportedApiVersion = options.supportedApiVersion ?? SYNC_PROVIDER_API_VERSION;

  const manifestName = registration.manifest.name.trim();
  if (!manifestName) {
    return err(
      createSyncProviderValidationError(
        "INVALID_MANIFEST",
        "Sync provider manifest requires non-empty name",
        {
          field: "name",
        },
      ),
    );
  }

  const manifestVersion = registration.manifest.version.trim();
  if (!manifestVersion) {
    return err(
      createSyncProviderValidationError(
        "INVALID_MANIFEST",
        "Sync provider manifest requires non-empty version",
        {
          field: "version",
        },
      ),
    );
  }

  if (!Number.isInteger(registration.manifest.apiVersion) || registration.manifest.apiVersion < 1) {
    return err(
      createSyncProviderValidationError(
        "INVALID_MANIFEST",
        "Sync provider manifest requires positive integer apiVersion",
        {
          field: "apiVersion",
          apiVersion: registration.manifest.apiVersion,
        },
      ),
    );
  }

  if (!isSyncProviderApiVersionCompatible(registration.manifest.apiVersion, supportedApiVersion)) {
    return err(
      createSyncProviderValidationError(
        "API_VERSION_MISMATCH",
        `Sync provider API version mismatch: provider=${registration.manifest.apiVersion} host=${supportedApiVersion}`,
        {
          providerApiVersion: registration.manifest.apiVersion,
          supportedApiVersion,
        },
      ),
    );
  }

  const providerCandidate = registration.provider as unknown;
  if (!providerCandidate || typeof providerCandidate !== "object") {
    return err(
      createSyncProviderValidationError("INVALID_PROVIDER", "Sync provider instance is required"),
    );
  }

  const providerRecord = providerCandidate as Record<string, unknown>;

  const providerName = normalizeNonEmptyString(providerRecord.name);
  if (!providerName) {
    return err(
      createSyncProviderValidationError(
        "INVALID_PROVIDER",
        "Sync provider requires non-empty name",
        {
          field: "provider.name",
        },
      ),
    );
  }

  const providerVersion = normalizeNonEmptyString(providerRecord.version);
  if (!providerVersion) {
    return err(
      createSyncProviderValidationError(
        "INVALID_PROVIDER",
        "Sync provider requires non-empty version",
        {
          field: "provider.version",
        },
      ),
    );
  }

  if (providerName !== manifestName || providerVersion !== manifestVersion) {
    return err(
      createSyncProviderValidationError(
        "IDENTITY_MISMATCH",
        "Sync provider identity does not match manifest",
        {
          manifestName,
          manifestVersion,
          providerName,
          providerVersion,
        },
      ),
    );
  }

  for (const method of REQUIRED_SYNC_PROVIDER_METHODS) {
    if (typeof providerRecord[method] !== "function") {
      return err(
        createSyncProviderValidationError(
          "INVALID_PROVIDER",
          `Sync provider is missing required method: ${method}`,
          {
            method,
          },
        ),
      );
    }
  }

  return ok({
    manifest: {
      name: manifestName,
      version: manifestVersion,
      apiVersion: registration.manifest.apiVersion,
    },
    provider: registration.provider,
  });
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
}

function createSyncProviderValidationError(
  code: SyncProviderValidationErrorCode,
  message: string,
  details?: Record<string, unknown>,
): SyncProviderValidationError {
  if (!details) {
    return {
      code,
      message,
    };
  }

  return {
    code,
    message,
    details,
  };
}
