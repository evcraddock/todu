// Branded types for type-safe IDs
export type TaskId = string & { readonly __brand: "TaskId" };
export type ProjectId = string & { readonly __brand: "ProjectId" };

// Task status
export type TaskStatus = "todo" | "in-progress" | "done";

// Task priority
export type TaskPriority = "low" | "medium" | "high";

// Core task type
export type Task = {
  id: TaskId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId?: ProjectId;
  labels: string[];
  createdAt: string;
  updatedAt: string;
};

// Project type
export type Project = {
  id: ProjectId;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

// Result type for error handling
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// Helper to create branded IDs
export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

export function createProjectId(id: string): ProjectId {
  return id as ProjectId;
}
