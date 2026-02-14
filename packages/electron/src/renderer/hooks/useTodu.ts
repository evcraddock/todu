import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateHabitInput,
  CreateLabelInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateRecurringInput,
  CreateTaskInput,
  HabitFilter,
  HabitId,
  LabelId,
  NoteFilter,
  NoteId,
  ProjectId,
  RecurringFilter,
  RecurringId,
  Result,
  Task,
  TaskFilter,
  TaskId,
  TaskSortOptions,
  ToduError,
  UpdateHabitInput,
  UpdateLabelInput,
  UpdateProjectInput,
  UpdateRecurringInput,
  UpdateTaskInput,
} from "@todu/core/browser";

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

// ============================================================================
// Task Hooks
// ============================================================================

export function useTasks(filter?: TaskFilter, sort?: TaskSortOptions) {
  return useQuery({
    queryKey: queryKeys.tasks(filter, sort),
    queryFn: async () => unwrap(await window.todu.task.list(filter, sort)),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: queryKeys.task(id),
    queryFn: async () => unwrap(await window.todu.task.get(id as TaskId)),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => unwrap(await window.todu.task.create(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: TaskId; input: UpdateTaskInput }) =>
      unwrap(await window.todu.task.update(id, input)),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.task(id) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: TaskId) => unwrap(await window.todu.task.delete(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useMoveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: TaskId; projectId: ProjectId }) =>
      unwrap(await window.todu.task.move(id, projectId)),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.task(id) });
    },
  });
}

export function useSearchTasks(query: string) {
  return useQuery({
    queryKey: ["tasks", "search", query],
    queryFn: async () => unwrap(await window.todu.task.search(query)),
    enabled: query.length > 0,
  });
}

/**
 * Agent-powered search: sends a natural language query to the search agent
 * which interprets it and returns matching tasks.
 *
 * Unlike useSearchTasks (instant text search), this is triggered explicitly
 * and uses the LLM to translate queries like "overdue bugs in todu" into
 * structured tool calls.
 */
export function useAgentSearch() {
  return useMutation({
    mutationFn: async (query: string) => {
      const results = await window.todu.agent.searchTasks(query);
      return results as Task[];
    },
  });
}

// ============================================================================
// Note Hooks (used for task comments)
// ============================================================================

export function useNotes(filter?: NoteFilter) {
  return useQuery({
    queryKey: queryKeys.notes(filter),
    queryFn: async () => unwrap(await window.todu.note.list(filter)),
    enabled: !!filter,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateNoteInput) => unwrap(await window.todu.note.create(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: NoteId) => unwrap(await window.todu.note.delete(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

// ============================================================================
// Label Hooks
// ============================================================================

export function useLabels() {
  return useQuery({
    queryKey: queryKeys.labels,
    queryFn: async () => unwrap(await window.todu.label.list()),
  });
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLabelInput) => unwrap(await window.todu.label.create(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels });
    },
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: LabelId; input: UpdateLabelInput }) =>
      unwrap(await window.todu.label.update(id, input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels });
    },
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: LabelId) => unwrap(await window.todu.label.delete(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels });
    },
  });
}

// ============================================================================
// Recurring Hooks
// ============================================================================

export function useRecurringList(filter?: RecurringFilter) {
  return useQuery({
    queryKey: queryKeys.recurring(filter),
    queryFn: async () => unwrap(await window.todu.recurring.list(filter)),
  });
}

export function useRecurringDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.recurringDetail(id),
    queryFn: async () => unwrap(await window.todu.recurring.get(id as RecurringId)),
    enabled: !!id,
  });
}

export function useUpcoming(options?: { templateId?: string; days?: number }) {
  return useQuery({
    queryKey: queryKeys.recurringUpcoming(options),
    queryFn: async () =>
      unwrap(
        await window.todu.recurring.upcoming(
          options?.templateId
            ? { templateId: options.templateId as RecurringId, days: options.days }
            : { days: options?.days },
        ),
      ),
  });
}

export function useCreateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRecurringInput) =>
      unwrap(await window.todu.recurring.create(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
  });
}

export function useUpdateRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: RecurringId; input: UpdateRecurringInput }) =>
      unwrap(await window.todu.recurring.update(id, input)),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringDetail(id) });
    },
  });
}

export function useDeleteRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: RecurringId) => unwrap(await window.todu.recurring.delete(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
  });
}

export function usePauseRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: RecurringId) => unwrap(await window.todu.recurring.pause(id)),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringDetail(id) });
    },
  });
}

export function useResumeRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: RecurringId) => unwrap(await window.todu.recurring.resume(id)),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringDetail(id) });
    },
  });
}

export function useGenerateOccurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, date }: { templateId: RecurringId; date: string }) =>
      unwrap(await window.todu.recurring.generate(templateId, date)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// ============================================================================
// Habit Hooks
// ============================================================================

export function useHabitList(filter?: HabitFilter) {
  return useQuery({
    queryKey: queryKeys.habits(filter),
    queryFn: async () => unwrap(await window.todu.habit.list(filter)),
  });
}

export function useHabitDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.habit(id),
    queryFn: async () => unwrap(await window.todu.habit.get(id as HabitId)),
    enabled: !!id,
  });
}

export function useHabitStreak(id: string) {
  return useQuery({
    queryKey: queryKeys.habitStreak(id),
    queryFn: async () => unwrap(await window.todu.habit.streak(id as HabitId)),
    enabled: !!id,
  });
}

export function useHabitHistory(id: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.habitHistory(id, days),
    queryFn: async () => unwrap(await window.todu.habit.history(id as HabitId, days)),
    enabled: !!id,
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateHabitInput) => unwrap(await window.todu.habit.create(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
    },
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: HabitId; input: UpdateHabitInput }) =>
      unwrap(await window.todu.habit.update(id, input)),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.habit(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.habitStreak(id) });
    },
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: HabitId) => unwrap(await window.todu.habit.delete(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
    },
  });
}

export function usePauseHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: HabitId) => unwrap(await window.todu.habit.pause(id)),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.habit(id) });
    },
  });
}

export function useResumeHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: HabitId) => unwrap(await window.todu.habit.resume(id)),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.habit(id) });
    },
  });
}

export function useCheckHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: HabitId) => unwrap(await window.todu.habit.check(id)),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.habit(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.habitStreak(id) });
      queryClient.invalidateQueries({ queryKey: ["habits", id, "history"] });
    },
  });
}

export function useUncheckHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: HabitId) => unwrap(await window.todu.habit.uncheck(id)),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.habit(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.habitStreak(id) });
      queryClient.invalidateQueries({ queryKey: ["habits", id, "history"] });
    },
  });
}
