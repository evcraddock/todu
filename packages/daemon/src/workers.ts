import { err, ok, type Result } from "@todu/core";

export const WORKER_DOMAIN_CAPABILITIES = [
  "project",
  "task",
  "label",
  "note",
  "recurring",
  "habit",
  "sync",
] as const;

export const WORKER_ROLE_HINTS = ["node", "authority"] as const;

export const WORKER_LIFECYCLE_STATES = [
  "registered",
  "running",
  "blocked",
  "error",
  "stopped",
] as const;

export type WorkerDomainCapability = (typeof WORKER_DOMAIN_CAPABILITIES)[number];
export type WorkerRoleHint = (typeof WORKER_ROLE_HINTS)[number];
export type WorkerLifecycleState = (typeof WORKER_LIFECYCLE_STATES)[number];

export interface WorkerManifest {
  type: string;
  requiredDomains: WorkerDomainCapability[];
  optionalDomains?: WorkerDomainCapability[];
  roleHints?: WorkerRoleHint[];
}

export interface WorkerRegistration {
  manifest: WorkerManifest;
}

export interface WorkerLifecycleTransitionDetails {
  blockedReason?: string;
  errorMessage?: string;
}

export interface RegisteredWorkerSnapshot {
  manifest: WorkerManifest;
  state: WorkerLifecycleState;
  blockedReason?: string;
  errorMessage?: string;
  updatedAt: string;
}

export const WORKER_REGISTRY_ERROR_CODES = [
  "INVALID_MANIFEST",
  "ALREADY_REGISTERED",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "MISSING_BLOCKED_REASON",
  "DEPENDENCY_BLOCKED",
] as const;

export type WorkerRegistryErrorCode = (typeof WORKER_REGISTRY_ERROR_CODES)[number];

export interface WorkerRegistryError {
  code: WorkerRegistryErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkerRegistry {
  register(registration: WorkerRegistration): Result<RegisteredWorkerSnapshot, WorkerRegistryError>;
  get(workerType: string): RegisteredWorkerSnapshot | undefined;
  list(): RegisteredWorkerSnapshot[];
  transition(
    workerType: string,
    state: WorkerLifecycleState,
    details?: WorkerLifecycleTransitionDetails,
  ): Result<RegisteredWorkerSnapshot, WorkerRegistryError>;
}

export interface CreateWorkerRegistryOptions {
  now?: () => string;
}

const ALLOWED_WORKER_STATE_TRANSITIONS: Record<
  WorkerLifecycleState,
  readonly WorkerLifecycleState[]
> = {
  registered: ["running", "blocked", "error", "stopped"],
  running: ["blocked", "error", "stopped"],
  blocked: ["running", "error", "stopped"],
  error: ["running", "blocked", "stopped"],
  stopped: ["running", "blocked", "error"],
};

export function createWorkerRegistry(options: CreateWorkerRegistryOptions = {}): WorkerRegistry {
  const now = options.now ?? (() => new Date().toISOString());
  const workers = new Map<string, RegisteredWorkerSnapshot>();

  return {
    register(registration) {
      const validatedManifest = validateWorkerManifest(registration.manifest);
      if (!validatedManifest.ok) {
        return validatedManifest;
      }

      const workerType = validatedManifest.value.type;
      if (workers.has(workerType)) {
        return err(
          createWorkerRegistryError(
            "ALREADY_REGISTERED",
            `Worker is already registered: ${workerType}`,
            {
              workerType,
            },
          ),
        );
      }

      const registeredWorker: RegisteredWorkerSnapshot = {
        manifest: validatedManifest.value,
        state: "registered",
        updatedAt: now(),
      };

      workers.set(workerType, registeredWorker);

      return ok(cloneRegisteredWorker(registeredWorker));
    },

    get(workerType) {
      const worker = workers.get(workerType.trim());
      if (!worker) {
        return undefined;
      }

      return cloneRegisteredWorker(worker);
    },

    list() {
      return Array.from(workers.values())
        .map((worker) => cloneRegisteredWorker(worker))
        .sort((a, b) => a.manifest.type.localeCompare(b.manifest.type));
    },

    transition(workerType, nextState, details = {}) {
      const normalizedWorkerType = workerType.trim();
      const worker = workers.get(normalizedWorkerType);
      if (!worker) {
        return err(
          createWorkerRegistryError(
            "NOT_FOUND",
            `Worker is not registered: ${normalizedWorkerType}`,
            {
              workerType: normalizedWorkerType,
            },
          ),
        );
      }

      if (worker.state === nextState) {
        return ok(cloneRegisteredWorker(worker));
      }

      const allowedTransitions = ALLOWED_WORKER_STATE_TRANSITIONS[worker.state];
      if (!allowedTransitions.includes(nextState)) {
        return err(
          createWorkerRegistryError(
            "INVALID_TRANSITION",
            `Invalid worker lifecycle transition: ${worker.state} -> ${nextState}`,
            {
              workerType: normalizedWorkerType,
              from: worker.state,
              to: nextState,
              allowed: allowedTransitions,
            },
          ),
        );
      }

      if (nextState === "blocked") {
        const blockedReason = details.blockedReason?.trim();
        if (!blockedReason) {
          return err(
            createWorkerRegistryError(
              "MISSING_BLOCKED_REASON",
              "Blocked worker state requires blockedReason",
              {
                workerType: normalizedWorkerType,
                to: nextState,
              },
            ),
          );
        }
      }

      const updatedWorker: RegisteredWorkerSnapshot = {
        ...worker,
        state: nextState,
        blockedReason: nextState === "blocked" ? details.blockedReason?.trim() : undefined,
        errorMessage:
          nextState === "error" ? normalizeOptionalString(details.errorMessage) : undefined,
        updatedAt: now(),
      };

      workers.set(normalizedWorkerType, updatedWorker);

      return ok(cloneRegisteredWorker(updatedWorker));
    },
  };
}

export function validateWorkerManifest(
  manifest: WorkerManifest,
): Result<WorkerManifest, WorkerRegistryError> {
  const workerType = manifest.type.trim();
  if (workerType.length === 0) {
    return err(
      createWorkerRegistryError("INVALID_MANIFEST", "Worker manifest requires non-empty type", {
        field: "type",
      }),
    );
  }

  if (!Array.isArray(manifest.requiredDomains)) {
    return err(
      createWorkerRegistryError(
        "INVALID_MANIFEST",
        "Worker manifest requires requiredDomains array",
        {
          field: "requiredDomains",
        },
      ),
    );
  }

  const requiredDomainsResult = normalizeDomainList(manifest.requiredDomains, "requiredDomains");
  if (!requiredDomainsResult.ok) {
    return requiredDomainsResult;
  }

  const optionalDomainsInput = manifest.optionalDomains ?? [];
  if (!Array.isArray(optionalDomainsInput)) {
    return err(
      createWorkerRegistryError(
        "INVALID_MANIFEST",
        "Worker manifest optionalDomains must be an array when provided",
        {
          field: "optionalDomains",
        },
      ),
    );
  }

  const optionalDomainsResult = normalizeDomainList(optionalDomainsInput, "optionalDomains");
  if (!optionalDomainsResult.ok) {
    return optionalDomainsResult;
  }

  const overlappingDomains = optionalDomainsResult.value.filter((domain) =>
    requiredDomainsResult.value.includes(domain),
  );
  if (overlappingDomains.length > 0) {
    return err(
      createWorkerRegistryError(
        "INVALID_MANIFEST",
        "Worker manifest cannot list the same domain as both required and optional",
        {
          field: "optionalDomains",
          overlappingDomains,
        },
      ),
    );
  }

  const roleHintsInput = manifest.roleHints ?? [];
  if (!Array.isArray(roleHintsInput)) {
    return err(
      createWorkerRegistryError(
        "INVALID_MANIFEST",
        "Worker manifest roleHints must be an array when provided",
        {
          field: "roleHints",
        },
      ),
    );
  }

  const normalizedRoleHints: WorkerRoleHint[] = [];
  for (const roleHint of roleHintsInput) {
    if (!isWorkerRoleHint(roleHint)) {
      return err(
        createWorkerRegistryError("INVALID_MANIFEST", `Unsupported worker role hint: ${roleHint}`, {
          field: "roleHints",
          roleHint,
          supported: WORKER_ROLE_HINTS,
        }),
      );
    }

    if (!normalizedRoleHints.includes(roleHint)) {
      normalizedRoleHints.push(roleHint);
    }
  }

  return ok({
    type: workerType,
    requiredDomains: requiredDomainsResult.value,
    optionalDomains: optionalDomainsResult.value,
    roleHints: normalizedRoleHints,
  });
}

export function isWorkerDomainCapability(value: string): value is WorkerDomainCapability {
  return (WORKER_DOMAIN_CAPABILITIES as readonly string[]).includes(value);
}

export function isWorkerRoleHint(value: string): value is WorkerRoleHint {
  return (WORKER_ROLE_HINTS as readonly string[]).includes(value);
}

export function isWorkerLifecycleState(value: string): value is WorkerLifecycleState {
  return (WORKER_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function findMissingRequiredWorkerDomains(
  requiredDomains: readonly WorkerDomainCapability[],
  enabledDomains: readonly WorkerDomainCapability[],
): WorkerDomainCapability[] {
  const enabledSet = new Set(enabledDomains);
  return requiredDomains.filter((domain) => !enabledSet.has(domain));
}

export function createWorkerDependencyBlockedReason(
  missingRequiredDomains: readonly WorkerDomainCapability[],
): string {
  const domains = missingRequiredDomains.join(", ");
  return `required domains are disabled or missing: ${domains}`;
}

function cloneRegisteredWorker(worker: RegisteredWorkerSnapshot): RegisteredWorkerSnapshot {
  return {
    manifest: {
      ...worker.manifest,
      requiredDomains: [...worker.manifest.requiredDomains],
      optionalDomains: worker.manifest.optionalDomains ? [...worker.manifest.optionalDomains] : [],
      roleHints: worker.manifest.roleHints ? [...worker.manifest.roleHints] : [],
    },
    state: worker.state,
    blockedReason: worker.blockedReason,
    errorMessage: worker.errorMessage,
    updatedAt: worker.updatedAt,
  };
}

function normalizeDomainList(
  domains: string[],
  field: "requiredDomains" | "optionalDomains",
): Result<WorkerDomainCapability[], WorkerRegistryError> {
  const normalized: WorkerDomainCapability[] = [];

  for (const domain of domains) {
    if (!isWorkerDomainCapability(domain)) {
      return err(
        createWorkerRegistryError(
          "INVALID_MANIFEST",
          `Unsupported worker domain capability: ${domain}`,
          {
            field,
            domain,
            supported: WORKER_DOMAIN_CAPABILITIES,
          },
        ),
      );
    }

    if (!normalized.includes(domain)) {
      normalized.push(domain);
    }
  }

  return ok(normalized);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized;
}

function createWorkerRegistryError(
  code: WorkerRegistryErrorCode,
  message: string,
  details?: Record<string, unknown>,
): WorkerRegistryError {
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
