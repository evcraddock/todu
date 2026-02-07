import type { Project, Settings } from "./types.js";

// ============================================================================
// Automerge Document Schemas
// ============================================================================

/**
 * Catalog document (one per todu instance).
 * Contains all small/bounded data: projects, labels, habits, settings,
 * recurring templates, and external system registrations.
 *
 * Other document types (TaskListDocument, TaskDetailDocument, CommentsDocument)
 * will be added in their respective vertical slices.
 */
export interface CatalogDocument {
  /** Schema version for migration support */
  version: number;

  /** All projects */
  projects: Project[];

  /** Application settings */
  settings: Settings;

  // Future slices will add:
  // labels: Label[];
  // habits: Habit[];
  // recurringTemplates: RecurringTemplate[];
  // systems: System[];
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
    settings: {
      schemaVersion: SCHEMA_VERSION,
    },
  };
}
