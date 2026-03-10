import {
  err,
  type IntegrationBinding,
  type NoteId,
  ok,
  type Project,
  type Result,
  type Task,
  type TaskPushPayload,
} from "./types.js";

export const SYNC_PROVIDER_API_VERSION = 2 as const;

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
  assignees?: string[];
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
  settings: Record<string, unknown>;
}

export interface SyncProviderPullResult {
  tasks: ExternalTask[];
  comments?: ExternalComment[];
}

export interface SyncProviderPushCommentLink {
  localNoteId: NoteId;
  externalCommentId: string;
  externalTaskId: string;
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

export interface SyncProviderPushResult {
  commentLinks: SyncProviderPushCommentLink[];
}

export interface SyncProvider {
  readonly name: string;
  readonly version: string;
  initialize(config: SyncProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResult>;
  push(
    binding: IntegrationBinding,
    tasks: TaskPushPayload[],
    project: Project,
  ): Promise<SyncProviderPushResult>;
  mapToTask(external: ExternalTask, project: Project): Task;
  mapFromTask(task: TaskPushPayload, project: Project): ExternalTask;
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

  const manifestCandidate = registration.manifest as unknown;
  if (!manifestCandidate || typeof manifestCandidate !== "object") {
    return err(
      createSyncProviderValidationError("INVALID_MANIFEST", "Sync provider manifest is required", {
        field: "manifest",
      }),
    );
  }

  const manifestRecord = manifestCandidate as Record<string, unknown>;

  const manifestName = normalizeNonEmptyString(manifestRecord.name);
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

  const manifestVersion = normalizeNonEmptyString(manifestRecord.version);
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

  const manifestApiVersion = normalizePositiveInteger(manifestRecord.apiVersion);
  if (manifestApiVersion === null) {
    return err(
      createSyncProviderValidationError(
        "INVALID_MANIFEST",
        "Sync provider manifest requires positive integer apiVersion",
        {
          field: "apiVersion",
          apiVersion: manifestRecord.apiVersion,
        },
      ),
    );
  }

  if (!isSyncProviderApiVersionCompatible(manifestApiVersion, supportedApiVersion)) {
    return err(
      createSyncProviderValidationError(
        "API_VERSION_MISMATCH",
        `Sync provider API version mismatch: provider=${manifestApiVersion} host=${supportedApiVersion}`,
        {
          providerApiVersion: manifestApiVersion,
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
      apiVersion: manifestApiVersion,
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

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
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
