import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateProjectInput,
  ProjectId,
  Result,
  ToduError,
  UpdateProjectInput,
} from "@todu/core";

// ============================================================================
// Query Keys
// ============================================================================

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  tasks: (filter?: unknown, sort?: unknown) => ["tasks", filter, sort] as const,
  task: (id: string) => ["tasks", id] as const,
  labels: ["labels"] as const,
  notes: (filter?: unknown) => ["notes", filter] as const,
  recurring: (filter?: unknown) => ["recurring", filter] as const,
  recurringDetail: (id: string) => ["recurring", id] as const,
  recurringUpcoming: (options?: unknown) => ["recurring", "upcoming", options] as const,
  habits: (filter?: unknown) => ["habits", filter] as const,
  habit: (id: string) => ["habits", id] as const,
  habitStreak: (id: string) => ["habits", id, "streak"] as const,
  habitHistory: (id: string, days?: number) => ["habits", id, "history", days] as const,
} as const;

// ============================================================================
// Helper: unwrap Result<T> for React Query
// ============================================================================

/** Format a ToduError into a human-readable string. */
function formatError(error: ToduError): string {
  switch (error.type) {
    case "not-found":
      return `${error.entity} not found: ${error.id}`;
    case "validation":
      return `${error.field}: ${error.message}`;
    case "storage":
      return `Storage error: ${error.message}`;
    default:
      return "Unknown error";
  }
}

/**
 * Unwrap a Result<T> — throws on error so React Query treats it as a failure.
 * This lets us use React Query's isError/error states naturally.
 */
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(formatError(result.error));
  }
  return result.value;
}

// ============================================================================
// Project Hooks
// ============================================================================

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: async () => unwrap(await window.todu.project.list()),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: async () => unwrap(await window.todu.project.get(id as ProjectId)),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) =>
      unwrap(await window.todu.project.create(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: ProjectId; input: UpdateProjectInput }) =>
      unwrap(await window.todu.project.update(id, input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: ProjectId) => unwrap(await window.todu.project.delete(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
