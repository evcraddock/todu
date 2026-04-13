import {
  type Actor,
  type ActorId,
  createActorId,
  type Habit,
  type HabitEntry,
  type HabitId,
  type ImportedContentApproval,
  type IntegrationBinding,
  type IntegrationBindingId,
  type IntegrationBindingStatus,
  type Label,
  type Note,
  type Project,
  type ProjectId,
  type RecurringTemplate,
  type Settings,
  type Task,
} from "./types.js";

// ============================================================================
// Automerge Document Schemas
// ============================================================================

/**
 * Catalog document (one per todu instance).
 * Contains all small/bounded data: projects, labels, habits, settings,
 * recurring templates, and shared integration binding metadata.
 */
export interface CatalogDocument {
  /** Schema version for migration support */
  version: number;

  /** All projects */
  projects: Project[];

  /** All labels */
  labels: Label[];

  /** Catalog-wide actors used for assignment and authorship. */
  actors: Actor[];

  /** Catalog owner actor, when established. */
  ownerActorId?: ActorId;

  /**
   * Map of projectId → Automerge document ID for that project's task list.
   * Populated when the first task is created in a project.
   */
  taskListDocIds: Record<string, string>;

  /** Legacy Automerge document ID for the old single notes document model */
  notesDocId?: string;

  /** Map of notes partition key → Automerge document ID */
  notesBucketDocIds: Record<string, string>;

  /** Legacy map of note ID → notes partition key retained for migration compatibility */
  noteBucketByNoteId: Record<string, string>;

  /** Recurring task templates */
  recurringTemplates: RecurringTemplate[];

  /** Automerge document ID for the shared integration binding registry */
  integrationRegistryDocId?: string;

  /** Map of integrationBindingId → Automerge document ID for that binding's status doc */
  integrationStatusDocIds: Record<string, string>;

  /** Habit definitions */
  habits: Habit[];

  /** Map of habitId → Automerge document ID for that habit's log */
  habitLogDocIds: Record<string, string>;

  /** Application settings */
  settings: Settings;

  // Future slices will add:
  // systems: System[];
}

/**
 * Task list document (one per project).
 * Contains task metadata only — no descriptions or heavy content.
 * Each task is ~200 bytes, so a project with 1000 tasks ≈ 200KB.
 */
export interface TaskListDocument {
  /** Project this task list belongs to */
  projectId: ProjectId;

  /** Task metadata entries */
  tasks: Task[];

  /**
   * Map of taskId → Automerge document ID for that task's detail doc.
   * Loaded on demand when task.get() is called.
   */
  detailDocIds: Record<string, string>;
}

/**
 * Task detail document (one per task).
 * Contains the description and any heavy content.
 * Loaded on demand, not during list operations.
 */
export interface TaskDetailDocument {
  /** The task this detail belongs to */
  taskId: string;

  /** Full task description (markdown) */
  description: string;

  /** Imported-content approval metadata for the description revision. */
  descriptionApproval?: ImportedContentApproval;
}

/**
 * Notes document (partition bucket).
 * Each bucket stores a subset of notes to reduce write contention and history growth.
 */
export interface NotesDocument {
  /** Notes for this bucket */
  notes: Note[];
}

/**
 * Integration registry document (one per dataset).
 * Stores all shared integration bindings.
 */
export interface IntegrationRegistryDocument {
  /** Shared integration bindings for this dataset */
  bindings: IntegrationBinding[];
}

/**
 * Integration binding status document (one per integration binding).
 * Stores synced operational status separately from desired state.
 */
export interface IntegrationBindingStatusDocument extends IntegrationBindingStatus {
  /** Which integration binding this status belongs to */
  bindingId: IntegrationBindingId;
}

/**
 * Habit log document (one per habit).
 * Contains check-in entries keyed by date for deterministic multi-device merging.
 */
export interface HabitLogDocument {
  /** Which habit this log belongs to */
  habitId: string;

  /** Check-in entries keyed by date (YYYY-MM-DD) */
  entries: Record<string, HabitEntry>;
}

// ============================================================================
// Schema version
// ============================================================================

export const SCHEMA_VERSION = 2;
export const DEFAULT_OWNER_ACTOR_ID = createActorId("actor-user");

// ============================================================================
// Factory functions
// ============================================================================

export function createEmptyCatalog(): CatalogDocument {
  return {
    version: SCHEMA_VERSION,
    projects: [],
    labels: [],
    actors: [{ id: DEFAULT_OWNER_ACTOR_ID, displayName: "user" }],
    ownerActorId: DEFAULT_OWNER_ACTOR_ID,
    taskListDocIds: {},
    notesBucketDocIds: {},
    noteBucketByNoteId: {},
    recurringTemplates: [],
    integrationStatusDocIds: {},
    habits: [],
    habitLogDocIds: {},
    settings: {
      schemaVersion: SCHEMA_VERSION,
    },
  };
}

export function createTaskListDocument(projectId: ProjectId): TaskListDocument {
  return {
    projectId,
    tasks: [],
    detailDocIds: {},
  };
}

export function createTaskDetailDocument(
  taskId: string,
  description: string,
  descriptionApproval?: ImportedContentApproval,
): TaskDetailDocument {
  return {
    taskId,
    description,
    ...(descriptionApproval !== undefined ? { descriptionApproval } : {}),
  };
}

export function createNotesDocument(): NotesDocument {
  return {
    notes: [],
  };
}

export function createIntegrationRegistryDocument(): IntegrationRegistryDocument {
  return {
    bindings: [],
  };
}

export function createIntegrationBindingStatusDocument(
  bindingId: IntegrationBindingId,
  updatedAt: string,
): IntegrationBindingStatusDocument {
  return {
    bindingId,
    state: "idle",
    authorityId: null,
    lastSuccessfulSyncAt: null,
    lastAttemptedSyncAt: null,
    lastErrorSummary: null,
    updatedAt,
  };
}

export function createHabitLogDocument(habitId: HabitId): HabitLogDocument {
  return {
    habitId,
    entries: {},
  };
}
