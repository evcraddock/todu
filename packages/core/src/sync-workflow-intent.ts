import type { IntegrationBindingId, ProjectId, TaskId, TaskStatus } from "./types.js";

/** Explicit local operator intent, not evidence of a remote deletion or a mirrored base. */
export interface PrepareSyncWorkflowIntentInput {
  readonly bindingId: IntegrationBindingId;
  readonly localTaskId: TaskId;
  readonly externalId: string;
  readonly sourceUrl?: string;
  readonly intent: "cancel";
  readonly reason: "confirmed-remote-deletion";
}

export interface SyncWorkflowIntentPreview {
  /** Host-issued, five-minute, single-use token; not portable across host instances. */
  readonly token: string;
  readonly bindingId: IntegrationBindingId;
  readonly projectId: ProjectId;
  readonly localTaskId: TaskId;
  readonly externalId: string;
  readonly sourceUrl?: string;
  readonly currentStatus: TaskStatus;
  readonly targetStatus: "canceled";
  readonly expiresAt: string;
}

export interface ConfirmSyncWorkflowIntentInput {
  readonly token: string;
  readonly confirmed: true;
}

/** Actual local identity and edit clock, verified after native local persistence. */
export interface SyncWorkflowIntentReceipt {
  readonly bindingId: IntegrationBindingId;
  readonly projectId: ProjectId;
  readonly localTaskId: TaskId;
  readonly externalId: string;
  readonly sourceUrl?: string;
  readonly status: "canceled";
  readonly updatedAt: string;
}
