// Branded types for type-safe IDs
export type TaskId = string & { readonly __brand: "TaskId" };
export type ProjectId = string & { readonly __brand: "ProjectId" };
export type LabelId = string & { readonly __brand: "LabelId" };
export type CommentId = string & { readonly __brand: "CommentId" };
export type HabitId = string & { readonly __brand: "HabitId" };

// Task status
export type TaskStatus = "active" | "inprogress" | "waiting" | "done" | "canceled";

// Task priority
export type TaskPriority = "low" | "medium" | "high";

// Result type for error handling
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// Helper to create branded IDs
export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

export function createProjectId(id: string): ProjectId {
  return id as ProjectId;
}

export function createLabelId(id: string): LabelId {
  return id as LabelId;
}

export function createCommentId(id: string): CommentId {
  return id as CommentId;
}

export function createHabitId(id: string): HabitId {
  return id as HabitId;
}
