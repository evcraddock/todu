import {
  err,
  type IntegrationBinding,
  type NoteId,
  ok,
  type Project,
  type Result,
  type Task,
  type TaskId,
  type TaskPriority,
  type TaskPushPayload,
  type TaskStatus,
} from "./types.js";

export const SYNC_PROVIDER_API_VERSION_V2 = 2 as const;
export const SYNC_PROVIDER_API_VERSION_V3 = 3 as const;
export const SYNC_PROVIDER_API_VERSION = SYNC_PROVIDER_API_VERSION_V3;
export const SYNC_PROVIDER_SUPPORTED_API_VERSIONS = [
  SYNC_PROVIDER_API_VERSION_V2,
  SYNC_PROVIDER_API_VERSION_V3,
] as const;

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

export interface ExternalActorRef {
  externalAccountId?: string;
  externalLogin?: string;
  displayName?: string;
  raw?: unknown;
}

export interface ImportedTaskInput {
  externalId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  assignees?: ExternalActorRef[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

export interface ImportedCommentInput {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: ExternalActorRef;
  createdAt: string;
  updatedAt?: string;
  raw?: unknown;
}

export interface ExportedCommentInput {
  localNoteId: NoteId;
  body: string;
  createdAt: string;
  updatedAt?: string;
  sourceUrl?: string;
}

export interface ExportedTaskInput {
  localTaskId: TaskId;
  externalId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  assignees: ExternalActorRef[];
  sourceUrl?: string;
  comments: ExportedCommentInput[];
}

export interface SyncProviderConfig {
  settings: Record<string, unknown>;
}

export interface SyncProviderPullResult {
  tasks: ExternalTask[];
  comments?: ExternalComment[];
}

export interface SyncProviderPullResultV3 {
  tasks: ImportedTaskInput[];
  comments?: ImportedCommentInput[];
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

export interface SyncProviderPushTaskLink {
  localTaskId: TaskId;
  externalId: string;
  sourceUrl?: string;
}

export interface SyncProviderPushResult {
  commentLinks: SyncProviderPushCommentLink[];
  taskLinks: SyncProviderPushTaskLink[];
}

export interface SyncProviderV2 {
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

export interface SyncProviderV3 {
  readonly name: string;
  readonly version: string;
  initialize(config: SyncProviderConfig): Promise<void>;
  shutdown(): Promise<void>;
  pull(binding: IntegrationBinding, project: Project): Promise<SyncProviderPullResultV3>;
  push(
    binding: IntegrationBinding,
    tasks: ExportedTaskInput[],
    project: Project,
  ): Promise<SyncProviderPushResult>;
}

export type SyncProvider = SyncProviderV2;
export type AnySyncProvider = SyncProviderV2 | SyncProviderV3;

export interface SyncProviderRegistrationV2 {
  manifest: SyncProviderManifest & {
    apiVersion: typeof SYNC_PROVIDER_API_VERSION_V2;
  };
  provider: SyncProviderV2;
}

export interface SyncProviderRegistrationV3 {
  manifest: SyncProviderManifest & {
    apiVersion: typeof SYNC_PROVIDER_API_VERSION_V3;
  };
  provider: SyncProviderV3;
}

export type AnySyncProviderRegistration = SyncProviderRegistrationV2 | SyncProviderRegistrationV3;
export type SyncProviderRegistration = AnySyncProviderRegistration;
export type LegacySyncProviderRegistration = SyncProviderRegistrationV2;

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
  supportedApiVersions?: readonly number[];
}

const REQUIRED_SYNC_PROVIDER_V2_METHODS = [
  "initialize",
  "shutdown",
  "pull",
  "push",
  "mapToTask",
  "mapFromTask",
] as const;

const REQUIRED_SYNC_PROVIDER_V3_METHODS = ["initialize", "shutdown", "pull", "push"] as const;

export function isSyncProviderApiVersionCompatible(
  providerApiVersion: number,
  supportedApiVersions: readonly number[] | number = SYNC_PROVIDER_SUPPORTED_API_VERSIONS,
): boolean {
  if (!Number.isInteger(providerApiVersion)) {
    return false;
  }

  const normalizedSupportedApiVersions = Array.isArray(supportedApiVersions)
    ? supportedApiVersions
    : [supportedApiVersions];

  return normalizedSupportedApiVersions.includes(providerApiVersion);
}

export function isSyncProviderRegistrationV2(
  registration: AnySyncProviderRegistration,
): registration is SyncProviderRegistrationV2 {
  return registration.manifest.apiVersion === SYNC_PROVIDER_API_VERSION_V2;
}

export function isSyncProviderRegistrationV3(
  registration: AnySyncProviderRegistration,
): registration is SyncProviderRegistrationV3 {
  return registration.manifest.apiVersion === SYNC_PROVIDER_API_VERSION_V3;
}

export function validateSyncProviderRegistration(
  registration: AnySyncProviderRegistration,
  options: ValidateSyncProviderRegistrationOptions = {},
): Result<AnySyncProviderRegistration, SyncProviderValidationError> {
  const supportedApiVersions = resolveSupportedApiVersions(options);

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

  if (!isSyncProviderApiVersionCompatible(manifestApiVersion, supportedApiVersions)) {
    return err(
      createSyncProviderValidationError(
        "API_VERSION_MISMATCH",
        `Sync provider API version mismatch: provider=${manifestApiVersion} host=${supportedApiVersions.join(",")}`,
        createApiVersionMismatchDetails(manifestApiVersion, supportedApiVersions),
      ),
    );
  }

  const requiredMethods = getRequiredSyncProviderMethods(manifestApiVersion);
  if (!requiredMethods) {
    return err(
      createSyncProviderValidationError(
        "API_VERSION_MISMATCH",
        `Sync provider API version is recognized as compatible but has no validator: provider=${manifestApiVersion}`,
        createApiVersionMismatchDetails(manifestApiVersion, supportedApiVersions),
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

  for (const method of requiredMethods) {
    if (typeof providerRecord[method] !== "function") {
      return err(
        createSyncProviderValidationError(
          "INVALID_PROVIDER",
          `Sync provider is missing required method: ${method}`,
          {
            method,
            apiVersion: manifestApiVersion,
          },
        ),
      );
    }
  }

  const normalizedManifest = {
    name: manifestName,
    version: manifestVersion,
    apiVersion: manifestApiVersion,
  };

  if (manifestApiVersion === SYNC_PROVIDER_API_VERSION_V2) {
    return ok({
      manifest: normalizedManifest as SyncProviderRegistrationV2["manifest"],
      provider: registration.provider as SyncProviderV2,
    });
  }

  return ok({
    manifest: normalizedManifest as SyncProviderRegistrationV3["manifest"],
    provider: registration.provider as SyncProviderV3,
  });
}

function resolveSupportedApiVersions(
  options: ValidateSyncProviderRegistrationOptions,
): readonly number[] {
  if (options.supportedApiVersions) {
    return options.supportedApiVersions;
  }

  if (options.supportedApiVersion !== undefined) {
    return [options.supportedApiVersion];
  }

  return SYNC_PROVIDER_SUPPORTED_API_VERSIONS;
}

function getRequiredSyncProviderMethods(apiVersion: number): readonly string[] | null {
  if (apiVersion === SYNC_PROVIDER_API_VERSION_V2) {
    return REQUIRED_SYNC_PROVIDER_V2_METHODS;
  }

  if (apiVersion === SYNC_PROVIDER_API_VERSION_V3) {
    return REQUIRED_SYNC_PROVIDER_V3_METHODS;
  }

  return null;
}

function createApiVersionMismatchDetails(
  providerApiVersion: number,
  supportedApiVersions: readonly number[],
): Record<string, unknown> {
  if (supportedApiVersions.length === 1) {
    return {
      providerApiVersion,
      supportedApiVersion: supportedApiVersions[0],
      supportedApiVersions: [...supportedApiVersions],
    };
  }

  return {
    providerApiVersion,
    supportedApiVersions: [...supportedApiVersions],
  };
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
