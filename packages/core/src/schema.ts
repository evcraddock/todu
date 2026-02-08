import type {
  Label,
  Note,
  Project,
  ProjectId,
  RecurringTemplate,
  Settings,
  Task,
} from "./types.js";

// ============================================================================
// Automerge Document Schemas
// ============================================================================

/**
 * Catalog document (one per todu instance).
 * Contains all small/bounded data: projects, labels, habits, settings,
 * recurring templates, and external system registrations.
 */
export interface CatalogDocument {
  /** Schema version for migration support */
  version: number;

  /** All projects */
  projects: Project[];

  /** All labels */
  labels: Label[];

  /**
   * Map of projectId → Automerge document ID for that project's task list.
   * Populated when the first task is created in a project.
   */
  taskListDocIds: Record<string, string>;

  /** Automerge document ID for the notes document */
  notesDocId?: string;

  /** Recurring task templates */
  recurringTemplates: RecurringTemplate[];

  /** Application settings */
  settings: Settings;

  // Future slices will add:
  // habits: Habit[];
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
}

/**
 * Notes document (one global).
 * Contains all notes — standalone journal entries and entity-attached notes.
 * Each note is ~200B, so thousands fit comfortably.
 */
export interface NotesDocument {
  /** All notes */
  notes: Note[];
}

// ============================================================================
// Schema version
// ============================================================================

export const SCHEMA_VERSION = 1;

// ============================================================================
// Factory functions
// ============================================================================

export function createEmptyCatalog(): CatalogDocument {
  return {
    version: SCHEMA_VERSION,
    projects: [],
    labels: [],
    taskListDocIds: {},
    recurringTemplates: [],
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

export function createTaskDetailDocument(taskId: string, description: string): TaskDetailDocument {
  return {
    taskId,
    description,
  };
}

export function createNotesDocument(): NotesDocument {
  return {
    notes: [],
  };
}
