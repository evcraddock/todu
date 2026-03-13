import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { Result, ToduError } from "@todu/core";
import type { Todu } from "@todu/engine";
import type { BrowserWindow } from "electron";

// ============================================================================
// Helpers
// ============================================================================

/** Format a Result<T> into an AgentToolResult. */
function formatResult<T>(result: Result<T, ToduError>): AgentToolResult<unknown> {
  if (!result.ok) {
    const error = result.error;
    let message: string;
    switch (error.type) {
      case "not-found":
        message = `Not found: ${error.entity} with id ${error.id}`;
        break;
      case "validation":
        message = `Validation error on ${error.field}: ${error.message}`;
        break;
      case "storage":
        message = `Storage error: ${error.message}`;
        break;
    }
    return { content: [{ type: "text", text: message }], details: { isError: true } };
  }
  const text = JSON.stringify(result.value, null, 2);
  return { content: [{ type: "text", text }], details: {} };
}

// ============================================================================
// Parameter Schemas
// ============================================================================

const ProjectStatusEnum = Type.Union([
  Type.Literal("active"),
  Type.Literal("done"),
  Type.Literal("canceled"),
]);

const ListProjectsParams = Type.Object({
  status: Type.Optional(
    Type.Array(ProjectStatusEnum, {
      description:
        'Filter by project status. Pass one or more statuses, e.g. ["active"] or ["active", "done"].',
    }),
  ),
  priority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Filter by priority",
    }),
  ),
  search: Type.Optional(Type.String({ description: "Search projects by name" })),
});

const CreateProjectParams = Type.Object({
  name: Type.String({ description: "Project name" }),
  description: Type.Optional(Type.String({ description: "Project description" })),
  priority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Project priority (default: medium)",
    }),
  ),
});

const UpdateProjectParams = Type.Object({
  id: Type.String({ description: "Project ID" }),
  name: Type.Optional(Type.String({ description: "New project name" })),
  description: Type.Optional(Type.String({ description: "New project description" })),
  status: Type.Optional(
    Type.Union([Type.Literal("active"), Type.Literal("done"), Type.Literal("canceled")], {
      description: "Project status",
    }),
  ),
  priority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Project priority",
    }),
  ),
});

const TaskStatusEnum = Type.Union([
  Type.Literal("active"),
  Type.Literal("inprogress"),
  Type.Literal("waiting"),
  Type.Literal("done"),
  Type.Literal("canceled"),
]);

const ListTasksParams = Type.Object({
  status: Type.Optional(
    Type.Array(TaskStatusEnum, {
      description:
        'Filter by task status. Pass one or more statuses, e.g. ["inprogress"] or ["active", "inprogress"].',
    }),
  ),
  priority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Filter by priority",
    }),
  ),
  projectId: Type.Optional(Type.String({ description: "Filter by project ID" })),
  label: Type.Optional(Type.String({ description: "Filter by label" })),
  dueBefore: Type.Optional(
    Type.String({ description: "Filter tasks due before date (YYYY-MM-DD)" }),
  ),
  dueAfter: Type.Optional(Type.String({ description: "Filter tasks due after date (YYYY-MM-DD)" })),
  overdue: Type.Optional(Type.Boolean({ description: "Filter overdue tasks" })),
  today: Type.Optional(Type.Boolean({ description: "Filter tasks due today" })),
  sortField: Type.Optional(
    Type.Union(
      [
        Type.Literal("priority"),
        Type.Literal("dueDate"),
        Type.Literal("createdAt"),
        Type.Literal("updatedAt"),
        Type.Literal("title"),
      ],
      { description: "Sort field" },
    ),
  ),
  sortDirection: Type.Optional(
    Type.Union([Type.Literal("asc"), Type.Literal("desc")], { description: "Sort direction" }),
  ),
});

const GetTaskParams = Type.Object({
  id: Type.String({ description: "Task ID" }),
});

const CreateTaskParams = Type.Object({
  title: Type.String({ description: "Task title" }),
  projectId: Type.String({ description: "Project ID to create the task in" }),
  priority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Task priority (default: medium)",
    }),
  ),
  description: Type.Optional(Type.String({ description: "Task description (markdown)" })),
  labels: Type.Optional(Type.Array(Type.String(), { description: "Label names" })),
  dueDate: Type.Optional(Type.String({ description: "Due date (YYYY-MM-DD)" })),
  scheduledDate: Type.Optional(Type.String({ description: "Scheduled date (YYYY-MM-DD)" })),
});

const UpdateTaskParams = Type.Object({
  id: Type.String({ description: "Task ID" }),
  title: Type.Optional(Type.String({ description: "New task title" })),
  status: Type.Optional(
    Type.Union(
      [
        Type.Literal("active"),
        Type.Literal("inprogress"),
        Type.Literal("waiting"),
        Type.Literal("done"),
        Type.Literal("canceled"),
      ],
      { description: "Task status" },
    ),
  ),
  priority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Task priority",
    }),
  ),
  description: Type.Optional(Type.String({ description: "Task description (markdown)" })),
  labels: Type.Optional(Type.Array(Type.String(), { description: "Label names" })),
  dueDate: Type.Optional(Type.String({ description: "Due date (YYYY-MM-DD)" })),
  scheduledDate: Type.Optional(Type.String({ description: "Scheduled date (YYYY-MM-DD)" })),
});

const MoveTaskParams = Type.Object({
  id: Type.String({ description: "Task ID" }),
  projectId: Type.String({ description: "Target project ID" }),
});

const SearchTasksParams = Type.Object({
  query: Type.String({ description: "Search query to match against task titles" }),
});

const ListLabelsParams = Type.Object({});

const CreateLabelParams = Type.Object({
  name: Type.String({ description: "Label name" }),
  color: Type.Optional(Type.String({ description: "Label color (hex, e.g. #ff0000)" })),
});

const ListHabitsParams = Type.Object({
  paused: Type.Optional(
    Type.Boolean({ description: "Filter by paused state (true = paused, false = active)" }),
  ),
  projectId: Type.Optional(Type.String({ description: "Filter by project ID" })),
  checkedToday: Type.Optional(
    Type.Boolean({
      description:
        "Filter by today's check-in (true = completed today, false = not yet done today)",
    }),
  ),
  search: Type.Optional(Type.String({ description: "Search habits by title" })),
});

const CheckHabitParams = Type.Object({
  id: Type.String({ description: "Habit ID" }),
});

const HabitStreakParams = Type.Object({
  id: Type.String({ description: "Habit ID" }),
});

const HabitHistoryParams = Type.Object({
  id: Type.String({ description: "Habit ID" }),
  days: Type.Optional(Type.Number({ description: "Number of days of history (default: 30)" })),
});

const ListRecurringParams = Type.Object({
  paused: Type.Optional(Type.Boolean({ description: "Filter by paused state" })),
  projectId: Type.Optional(Type.String({ description: "Filter by project ID" })),
  search: Type.Optional(Type.String({ description: "Search recurring templates by title" })),
});

const RecurringUpcomingParams = Type.Object({
  templateId: Type.Optional(Type.String({ description: "Filter by template ID" })),
  days: Type.Optional(Type.Number({ description: "Number of days to look ahead (default: 14)" })),
});

const CreateNoteParams = Type.Object({
  content: Type.String({ description: "Note content (markdown)" }),
  author: Type.Optional(Type.String({ description: "Note author" })),
  entityType: Type.Optional(
    Type.Union([Type.Literal("task"), Type.Literal("project"), Type.Literal("habit")], {
      description: "Entity type to attach the note to",
    }),
  ),
  entityId: Type.Optional(Type.String({ description: "Entity ID to attach the note to" })),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Note tags" })),
});

const ListNotesParams = Type.Object({
  entityType: Type.Optional(
    Type.Union([Type.Literal("task"), Type.Literal("project"), Type.Literal("habit")], {
      description: "Filter by entity type",
    }),
  ),
  entityId: Type.Optional(Type.String({ description: "Filter by entity ID" })),
  tag: Type.Optional(Type.String({ description: "Filter by tag" })),
  author: Type.Optional(Type.String({ description: "Filter by author" })),
});

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create all todu agent tools from a Todu engine instance.
 * Each tool wraps an engine SDK method and returns structured results.
 */
export function createToduTools(todu: Todu, mainWindow?: BrowserWindow): AgentTool<TSchema>[] {
  return [
    // ── Projects ─────────────────────────────────────────────────────
    {
      name: "list_projects",
      description:
        "List projects with optional filtering by status, priority, or name search. Use filter parameters so the UI updates to show matching projects.",
      label: "List Projects",
      parameters: ListProjectsParams,
      execute: async (_toolCallId, params) => {
        const filter = Object.keys(params).length > 0 ? params : undefined;
        const result = await todu.project.list(filter);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:ui-action", {
            action: "show_projects",
            filter: filter ?? {},
          });
        }

        return formatResult(result);
      },
    },
    {
      name: "create_project",
      description: "Create a new project.",
      label: "Create Project",
      parameters: CreateProjectParams,
      execute: async (_toolCallId, params) => formatResult(await todu.project.create(params)),
    },
    {
      name: "update_project",
      description: "Update a project's name, description, status, or priority.",
      label: "Update Project",
      parameters: UpdateProjectParams,
      execute: async (_toolCallId, { id, ...input }) =>
        formatResult(await todu.project.update(id, input)),
    },

    // ── Tasks ────────────────────────────────────────────────────────
    {
      name: "list_tasks",
      description:
        "List tasks with optional filtering by status, priority, project, label, or due date. Supports sorting.",
      label: "List Tasks",
      parameters: ListTasksParams,
      execute: async (_toolCallId, params) => {
        const { sortField, sortDirection, ...filter } = params;
        const sort = sortField
          ? { field: sortField, direction: sortDirection ?? "asc" }
          : undefined;
        const result = await todu.task.list(filter, sort);

        // Emit UI action to navigate Tasks view with the same filters
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:ui-action", {
            action: "show_tasks",
            filter,
          });
        }

        return formatResult(result);
      },
    },
    {
      name: "get_task",
      description: "Get full task details including description.",
      label: "Get Task",
      parameters: GetTaskParams,
      execute: async (_toolCallId, { id }) => {
        const result = await todu.task.get(id);

        if (result.ok && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:ui-action", {
            action: "show_task_detail",
            taskId: id,
          });
        }

        return formatResult(result);
      },
    },
    {
      name: "create_task",
      description: "Create a new task in a project.",
      label: "Create Task",
      parameters: CreateTaskParams,
      execute: async (_toolCallId, params) => {
        const result = await todu.task.create(params);

        if (result.ok && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:ui-action", {
            action: "show_task_detail",
            taskId: result.value.id,
          });
        }

        return formatResult(result);
      },
    },
    {
      name: "update_task",
      description: "Update a task's title, status, priority, description, labels, or dates.",
      label: "Update Task",
      parameters: UpdateTaskParams,
      execute: async (_toolCallId, { id, ...input }) =>
        formatResult(await todu.task.update(id, input)),
    },
    {
      name: "move_task",
      description: "Move a task to a different project.",
      label: "Move Task",
      parameters: MoveTaskParams,
      execute: async (_toolCallId, { id, projectId }) =>
        formatResult(await todu.task.move(id, projectId)),
    },
    {
      name: "search_tasks",
      description: "Search tasks by title.",
      label: "Search Tasks",
      parameters: SearchTasksParams,
      execute: async (_toolCallId, { query }) => formatResult(await todu.task.search(query)),
    },

    // ── Labels ───────────────────────────────────────────────────────
    {
      name: "list_labels",
      description: "List all labels.",
      label: "List Labels",
      parameters: ListLabelsParams,
      execute: async () => formatResult(await todu.label.list()),
    },
    {
      name: "create_label",
      description: "Create a new label.",
      label: "Create Label",
      parameters: CreateLabelParams,
      execute: async (_toolCallId, params) => formatResult(await todu.label.create(params)),
    },

    // ── Habits ───────────────────────────────────────────────────────
    {
      name: "list_habits",
      description:
        "List habits with optional filtering by paused state, project, or title search. Use filter parameters so the UI updates to show matching habits.",
      label: "List Habits",
      parameters: ListHabitsParams,
      execute: async (_toolCallId, params) => {
        const filter = Object.keys(params).length > 0 ? params : undefined;
        const result = await todu.habit.list(filter);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:ui-action", {
            action: "show_habits",
            filter: filter ?? {},
          });
        }

        return formatResult(result);
      },
    },
    {
      name: "check_habit",
      description: "Check in a habit for today, marking it as completed.",
      label: "Check Habit",
      parameters: CheckHabitParams,
      execute: async (_toolCallId, { id }) => formatResult(await todu.habit.check(id)),
    },
    {
      name: "habit_streak",
      description: "Get current and longest streak info for a habit.",
      label: "Habit Streak",
      parameters: HabitStreakParams,
      execute: async (_toolCallId, { id }) => formatResult(await todu.habit.streak(id)),
    },
    {
      name: "habit_history",
      description: "Get check-in history for a habit over a number of days.",
      label: "Habit History",
      parameters: HabitHistoryParams,
      execute: async (_toolCallId, { id, days }) =>
        formatResult(await todu.habit.history(id, days)),
    },

    // ── Recurring ────────────────────────────────────────────────────
    {
      name: "list_recurring",
      description:
        "List recurring task templates with optional filtering by paused state, project, or title search. Use filter parameters so the UI updates.",
      label: "List Recurring",
      parameters: ListRecurringParams,
      execute: async (_toolCallId, params) => {
        const filter = Object.keys(params).length > 0 ? params : undefined;
        const result = await todu.recurring.list(filter);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("todu:ui-action", {
            action: "show_recurring",
            filter: filter ?? {},
          });
        }

        return formatResult(result);
      },
    },
    {
      name: "recurring_upcoming",
      description: "Show upcoming occurrences of recurring tasks.",
      label: "Upcoming Recurring",
      parameters: RecurringUpcomingParams,
      execute: async (_toolCallId, params) => {
        const options = Object.keys(params).length > 0 ? params : undefined;
        return formatResult(await todu.recurring.upcoming(options));
      },
    },

    // ── Notes ────────────────────────────────────────────────────────
    {
      name: "create_note",
      description: "Create a note, optionally attached to a task, project, or habit.",
      label: "Create Note",
      parameters: CreateNoteParams,
      execute: async (_toolCallId, params) => formatResult(await todu.note.create(params)),
    },
    {
      name: "list_notes",
      description: "List notes, optionally filtered by entity, tag, or author.",
      label: "List Notes",
      parameters: ListNotesParams,
      execute: async (_toolCallId, params) => {
        const filter = Object.keys(params).length > 0 ? params : undefined;
        return formatResult(await todu.note.list(filter));
      },
    },
  ];
}
