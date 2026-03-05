import { err, ok, type Result } from "./types.js";

export const WORKER_PLUGIN_DOMAIN_CAPABILITIES = [
  "project",
  "task",
  "label",
  "note",
  "recurring",
  "habit",
  "sync",
] as const;

export const WORKER_PLUGIN_ROLE_HINTS = ["node", "authority"] as const;

export type WorkerPluginDomainCapability = (typeof WORKER_PLUGIN_DOMAIN_CAPABILITIES)[number];
export type WorkerPluginRoleHint = (typeof WORKER_PLUGIN_ROLE_HINTS)[number];

export interface WorkerPluginManifest {
  name: string;
  version: string;
  worker: {
    type: string;
    requiredDomains: WorkerPluginDomainCapability[];
    optionalDomains?: WorkerPluginDomainCapability[];
    roleHints?: WorkerPluginRoleHint[];
  };
}

export interface WorkerPluginRuntimeHandle {
  stop(): void;
}

export interface WorkerPluginRuntime {
  start(): WorkerPluginRuntimeHandle;
}

export interface WorkerPluginHostLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface WorkerPluginHostContext {
  getTodu: () => unknown | null;
  logger: WorkerPluginHostLogger;
  config: Record<string, unknown>;
}

export interface WorkerPluginRegistration {
  manifest: WorkerPluginManifest;
  createRuntime(context: WorkerPluginHostContext): WorkerPluginRuntime;
}

export const WORKER_PLUGIN_VALIDATION_ERROR_CODES = [
  "INVALID_MANIFEST",
  "INVALID_RUNTIME",
] as const;

export type WorkerPluginValidationErrorCode = (typeof WORKER_PLUGIN_VALIDATION_ERROR_CODES)[number];

export interface WorkerPluginValidationError {
  code: WorkerPluginValidationErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function validateWorkerPluginRegistration(
  registration: WorkerPluginRegistration,
): Result<WorkerPluginRegistration, WorkerPluginValidationError> {
  const manifest = registration.manifest as unknown;
  if (!isRecord(manifest)) {
    return err(createValidationError("INVALID_MANIFEST", "Worker plugin manifest is required"));
  }

  const manifestName = normalizeNonEmptyString(manifest.name);
  if (!manifestName) {
    return err(
      createValidationError("INVALID_MANIFEST", "Worker plugin manifest requires non-empty name", {
        field: "name",
      }),
    );
  }

  const manifestVersion = normalizeNonEmptyString(manifest.version);
  if (!manifestVersion) {
    return err(
      createValidationError(
        "INVALID_MANIFEST",
        "Worker plugin manifest requires non-empty version",
        {
          field: "version",
        },
      ),
    );
  }

  const workerManifest = manifest.worker;
  if (!isRecord(workerManifest)) {
    return err(
      createValidationError("INVALID_MANIFEST", "Worker plugin manifest requires worker object", {
        field: "worker",
      }),
    );
  }

  const workerType = normalizeNonEmptyString(workerManifest.type);
  if (!workerType) {
    return err(
      createValidationError("INVALID_MANIFEST", "Worker plugin worker.type must be non-empty", {
        field: "worker.type",
      }),
    );
  }

  if (!Array.isArray(workerManifest.requiredDomains)) {
    return err(
      createValidationError(
        "INVALID_MANIFEST",
        "Worker plugin worker.requiredDomains must be an array",
        {
          field: "worker.requiredDomains",
        },
      ),
    );
  }

  const requiredDomainsResult = normalizeDomainList(
    workerManifest.requiredDomains,
    "requiredDomains",
  );
  if (!requiredDomainsResult.ok) {
    return requiredDomainsResult;
  }

  const optionalDomainsInput = workerManifest.optionalDomains ?? [];
  if (!Array.isArray(optionalDomainsInput)) {
    return err(
      createValidationError(
        "INVALID_MANIFEST",
        "Worker plugin worker.optionalDomains must be an array when provided",
        {
          field: "worker.optionalDomains",
        },
      ),
    );
  }

  const optionalDomainsResult = normalizeDomainList(optionalDomainsInput, "optionalDomains");
  if (!optionalDomainsResult.ok) {
    return optionalDomainsResult;
  }

  const roleHintsInput = workerManifest.roleHints ?? [];
  if (!Array.isArray(roleHintsInput)) {
    return err(
      createValidationError("INVALID_MANIFEST", "Worker plugin worker.roleHints must be an array", {
        field: "worker.roleHints",
      }),
    );
  }

  const roleHintsResult = normalizeRoleHints(roleHintsInput);
  if (!roleHintsResult.ok) {
    return roleHintsResult;
  }

  if (typeof registration.createRuntime !== "function") {
    return err(
      createValidationError("INVALID_RUNTIME", "Worker plugin must define createRuntime(context)", {
        field: "createRuntime",
      }),
    );
  }

  return ok({
    manifest: {
      name: manifestName,
      version: manifestVersion,
      worker: {
        type: workerType,
        requiredDomains: requiredDomainsResult.value,
        optionalDomains: optionalDomainsResult.value,
        roleHints: roleHintsResult.value,
      },
    },
    createRuntime: registration.createRuntime,
  });
}

function normalizeDomainList(
  values: unknown[],
  field: "requiredDomains" | "optionalDomains",
): Result<WorkerPluginDomainCapability[], WorkerPluginValidationError> {
  const normalized: WorkerPluginDomainCapability[] = [];

  for (const rawValue of values) {
    if (typeof rawValue !== "string") {
      return err(
        createValidationError(
          "INVALID_MANIFEST",
          `Worker plugin ${field} entries must be strings`,
          {
            field: `worker.${field}`,
            value: rawValue,
          },
        ),
      );
    }

    const normalizedValue = rawValue.trim().toLowerCase();
    if (!isWorkerPluginDomainCapability(normalizedValue)) {
      return err(
        createValidationError(
          "INVALID_MANIFEST",
          `Worker plugin ${field} contains unsupported capability: ${rawValue}`,
          {
            field: `worker.${field}`,
            value: rawValue,
          },
        ),
      );
    }

    if (!normalized.includes(normalizedValue)) {
      normalized.push(normalizedValue);
    }
  }

  return ok(normalized);
}

function normalizeRoleHints(
  values: unknown[],
): Result<WorkerPluginRoleHint[], WorkerPluginValidationError> {
  const normalized: WorkerPluginRoleHint[] = [];

  for (const rawValue of values) {
    if (typeof rawValue !== "string") {
      return err(
        createValidationError(
          "INVALID_MANIFEST",
          "Worker plugin roleHints entries must be strings",
          {
            field: "worker.roleHints",
            value: rawValue,
          },
        ),
      );
    }

    const normalizedValue = rawValue.trim().toLowerCase();
    if (!isWorkerPluginRoleHint(normalizedValue)) {
      return err(
        createValidationError(
          "INVALID_MANIFEST",
          `Worker plugin roleHints contains unsupported role hint: ${rawValue}`,
          {
            field: "worker.roleHints",
            value: rawValue,
          },
        ),
      );
    }

    if (!normalized.includes(normalizedValue)) {
      normalized.push(normalizedValue);
    }
  }

  return ok(normalized);
}

function createValidationError(
  code: WorkerPluginValidationErrorCode,
  message: string,
  details?: Record<string, unknown>,
): WorkerPluginValidationError {
  if (!details) {
    return { code, message };
  }

  return {
    code,
    message,
    details,
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

function isWorkerPluginDomainCapability(value: string): value is WorkerPluginDomainCapability {
  return (WORKER_PLUGIN_DOMAIN_CAPABILITIES as readonly string[]).includes(value);
}

function isWorkerPluginRoleHint(value: string): value is WorkerPluginRoleHint {
  return (WORKER_PLUGIN_ROLE_HINTS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
