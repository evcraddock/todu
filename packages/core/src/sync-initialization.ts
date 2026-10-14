import type { SyncTaskFieldGroup, SyncTaskFieldGroupValues } from "./sync-field-groups.js";
import type { SyncLocalTaskQuery, SyncProviderPullContext } from "./sync-local-task-context.js";
import type {
  ExportedTaskInput,
  SyncProviderPullResultV6,
  SyncProviderV6,
} from "./sync-provider.js";
import type { IntegrationBinding, Project, TaskId } from "./types.js";

/** Unknown history is never equivalent to a known empty value. */
export type SyncTaskBaseline<K extends SyncTaskFieldGroup> =
  | { readonly state: "unknown" }
  | { readonly state: "known"; readonly value: SyncTaskFieldGroupValues[K] };

export type SyncInitializationDeferredReason =
  | "incomplete-assignment-mapping"
  | "pending-content-approval"
  | "initialization-disagreement"
  | "remote-value-unknown";

export type SyncObservedGroup<K extends SyncTaskFieldGroup> =
  | { readonly state: "known"; readonly value: SyncTaskFieldGroupValues[K] }
  | { readonly state: "deferred"; readonly reason: SyncInitializationDeferredReason };

export type SyncObservedGroups = {
  readonly [K in SyncTaskFieldGroup]: SyncObservedGroup<K>;
};

export interface SyncTaskGroupsObservation {
  readonly localTaskId: TaskId;
  readonly externalId: string;
  readonly sourceUrl?: string;
  readonly updatedAt: string;
  /** Issued only for this binding, host and pull invocation; never persist for reuse. */
  readonly observationToken: string;
  readonly groups: SyncObservedGroups;
}

export type SyncTaskGroupsResolution =
  | { readonly state: "found"; readonly task: SyncTaskGroupsObservation }
  | { readonly state: "missing" | "ambiguous" }
  | { readonly state: "unknown"; readonly reason: string };

export interface SyncProviderPullContextV7 extends SyncProviderPullContext {
  /** Reuses the scoped identity resolver; does not expose mutable host services. */
  readonly observeTaskGroups: (query: SyncLocalTaskQuery) => Promise<SyncTaskGroupsResolution>;
}

export interface SyncTaskFieldGroupUpdateV7 {
  externalId: string;
  localTaskId?: TaskId;
  observationToken: string;
  groups: {
    [K in SyncTaskFieldGroup]?: {
      base: SyncTaskBaseline<K>;
      remote: SyncTaskFieldGroupValues[K];
      sourceTimestamp?: string;
    };
  };
}

/** Persisted local values and proven mirroring are deliberately separate facts. */
export type SyncPersistedGroupReceipt<K extends SyncTaskFieldGroup> =
  | {
      state: "persisted";
      value: SyncTaskFieldGroupValues[K];
      baseline: "mirrored";
      remoteWriteRequired: false;
    }
  | {
      state: "persisted";
      value: SyncTaskFieldGroupValues[K];
      baseline: "unproven";
      remoteWriteRequired: true;
      reason: "remote-write-required";
    }
  | {
      state: "persisted";
      value: SyncTaskFieldGroupValues[K];
      baseline: "unproven";
      remoteWriteRequired: false;
      reason: "initialization-disagreement" | "remote-value-unknown";
    }
  | { state: "deferred"; reason: SyncInitializationDeferredReason };

export interface SyncTaskPersistedReceipt {
  externalId: string;
  localTaskId: TaskId;
  groups: { [K in SyncTaskFieldGroup]?: SyncPersistedGroupReceipt<K> };
}

export interface SyncProviderPullAcknowledgmentV7 {
  /** Ordered actual outcomes for every bootstrap row, including skipped old payloads. */
  bootstrapResults: SyncTaskPersistedReceipt[];
  /** Ordered actual outcomes for every task update, not the requested values. */
  taskResults: SyncTaskPersistedReceipt[];
}

export interface SyncProviderPullResultV7 extends Omit<SyncProviderPullResultV6, "taskUpdates"> {
  taskUpdates: SyncTaskFieldGroupUpdateV7[];
}

export type SyncProviderRecoveryState =
  | { state: "ready" }
  | { state: "legacy-pending"; batchIds: string[] }
  | { state: "unknown"; reason: string };

/** No flattened or partially mapped assignment may masquerade as a complete group. */
export interface ExportedTaskInputV7
  extends Omit<
    ExportedTaskInput,
    "title" | "description" | "status" | "priority" | "labels" | "assignees"
  > {
  groups: SyncObservedGroups;
}

export interface SyncProviderV7 extends Omit<SyncProviderV6, "pull" | "push" | "acknowledgePull"> {
  /** Must inspect durable original pending work before any v7 pull or push. */
  recoveryState(binding: IntegrationBinding, project: Project): Promise<SyncProviderRecoveryState>;
  pull(
    binding: IntegrationBinding,
    project: Project,
    context: SyncProviderPullContextV7,
  ): Promise<SyncProviderPullResultV7>;
  acknowledgePull(
    binding: IntegrationBinding,
    checkpoint: unknown,
    project: Project,
    acknowledgment: SyncProviderPullAcknowledgmentV7,
  ): Promise<void>;
  /** Provider-owned writes must respect deferred groups and proven baseline history. */
  push(
    binding: IntegrationBinding,
    tasks: ExportedTaskInputV7[],
    project: Project,
  ): Promise<Awaited<ReturnType<SyncProviderV6["push"]>>>;
}
