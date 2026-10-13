import type { IntegrationBindingId, ProjectId, TaskId, TaskStatus } from "./types.js";

/** Read-only identity assertions; every supplied selector must agree. */
export interface SyncLocalTaskQuery {
  readonly localTaskId?: TaskId;
  readonly externalId?: string;
  readonly sourceUrl?: string;
}

export interface SyncLocalTaskObservation {
  readonly localTaskId: TaskId;
  readonly projectId: ProjectId;
  readonly externalId?: string;
  readonly sourceUrl?: string;
  readonly status: TaskStatus;
  readonly updatedAt: string;
  /** Host-issued, pull-invocation-local receipt; not reusable after retry/restart. */
  readonly observationToken: string;
}

export type SyncLocalTaskResolution =
  | { readonly state: "found"; readonly task: SyncLocalTaskObservation }
  | { readonly state: "missing" }
  | { readonly state: "ambiguous" }
  | {
      readonly state: "unknown";
      readonly reason: "invalid-query" | "identity-mismatch" | "context-expired";
    };

export interface SyncProviderPullContext {
  readonly bindingId: IntegrationBindingId;
  readonly projectId: ProjectId;
  readonly observedAt: string;
  /** Resolve only within the bound project; no engine or storage access. */
  readonly resolveTask: (query: SyncLocalTaskQuery) => SyncLocalTaskResolution;
}

export interface SyncCancelledTaskExclusion {
  readonly observationToken: string;
}
