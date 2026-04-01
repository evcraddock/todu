import crypto from "node:crypto";
import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateTaskInput,
  createTaskDetailDocument,
  createTaskId,
  createTaskListDocument,
  dateToTimezoneISO,
  err,
  notFound,
  ok,
  type ProjectId,
  type Result,
  type Task,
  type TaskDetailDocument,
  type TaskFilter,
  type TaskId,
  type TaskListDocument,
  type TaskSortField,
  type TaskSortOptions,
  type TaskWithDetail,
  type UpdateTaskInput,
  validateCreateTaskInput,
  validateTaskFilter,
  validateUpdateTaskInput,
  validationError,
} from "@todu/core";
import type { TaskNamespace } from "./todu.js";

// ============================================================================
// Task namespace — multi-document CRUD
// ============================================================================

/**
 * Extended task namespace with internal methods for use by recurring templates.
 * The public TaskNamespace is a subset of this.
 */
export interface InternalTaskNamespace extends TaskNamespace {
  /**
   * Create a task with a specific ID and optional templateId.
   * Used by recurring template task generation.
   */
  create(
    input: CreateTaskInput,
    taskId?: TaskId,
    templateId?: string,
  ): Promise<Result<TaskWithDetail>>;

  /** Expose repo for recurring template task lookup */
  _repo: Repo;
}

export function createTaskNamespace(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): InternalTaskNamespace {
  function normalizeRangeBoundary(
    value: string,
    bound: "start" | "end",
    timezone?: string,
  ): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (timezone) {
        return dateToTimezoneISO(value, bound, timezone);
      }
      const [year, month, day] = value.split("-").map(Number);
      const time =
        bound === "start"
          ? Date.UTC(year, month - 1, day, 0, 0, 0, 0)
          : Date.UTC(year, month - 1, day, 23, 59, 59, 999);
      return new Date(time).toISOString();
    }

    return new Date(value).toISOString();
  }

  function normalizeTaskFilter(filter?: TaskFilter): TaskFilter | undefined {
    if (!filter) return undefined;

    const normalized: TaskFilter = { ...filter };
    if (filter.createdFrom !== undefined) {
      normalized.createdFrom = normalizeRangeBoundary(filter.createdFrom, "start", filter.timezone);
    }
    if (filter.createdTo !== undefined) {
      normalized.createdTo = normalizeRangeBoundary(filter.createdTo, "end", filter.timezone);
    }

    return normalized;
  }

  function migrateTaskListDoc(handle: DocHandle<TaskListDocument>): void {
    const doc = handle.doc();
    if (!doc) return;

    const tasks = doc.tasks ?? [];
    const needsMigration =
      doc.detailDocIds === undefined ||
      doc.detailDocIds === null ||
      tasks.some((task) => task.labels === undefined || task.labels === null) ||
      tasks.some((task) => task.assignees === undefined || task.assignees === null);

    if (!needsMigration) return;

    handle.change((d) => {
      if (d.detailDocIds === undefined || d.detailDocIds === null) {
        d.detailDocIds = {};
      }
      for (const task of d.tasks) {
        if (task.labels === undefined || task.labels === null) {
          task.labels = [];
        }
        if (task.assignees === undefined || task.assignees === null) {
          task.assignees = [];
        }
      }
    });
  }

  async function loadTaskListDoc(docId: string): Promise<DocHandle<TaskListDocument>> {
    const handle = await repo.find<TaskListDocument>(docId as DocumentId);
    migrateTaskListDoc(handle);
    return handle;
  }

  /**
   * Get or create the TaskListDocument for a project.
   * Stores the document ID in catalog.taskListDocIds.
   */
  async function getOrCreateTaskListDoc(
    projectId: ProjectId,
  ): Promise<DocHandle<TaskListDocument>> {
    const catalogDoc = catalog.doc();
    const existingDocId = catalogDoc?.taskListDocIds[projectId];

    if (existingDocId) {
      return await loadTaskListDoc(existingDocId);
    }

    // Create new task list document
    const handle = repo.create<TaskListDocument>();
    const template = createTaskListDocument(projectId);
    handle.change((doc) => {
      doc.projectId = template.projectId;
      doc.tasks = template.tasks;
      doc.detailDocIds = template.detailDocIds;
    });

    // Register in catalog
    catalog.change((doc) => {
      doc.taskListDocIds[projectId] = handle.documentId;
    });

    return handle;
  }

  /**
   * Find a task across all task list documents.
   * Returns the task, its index, and the task list handle.
   */
  async function findTask(
    id: TaskId,
  ): Promise<
    | { found: true; task: Task; index: number; listHandle: DocHandle<TaskListDocument> }
    | { found: false }
  > {
    const catalogDoc = catalog.doc();
    if (!catalogDoc) return { found: false };

    for (const docId of Object.values(catalogDoc.taskListDocIds)) {
      const handle = await loadTaskListDoc(docId);
      const doc = handle.doc();
      if (!doc) continue;

      const index = doc.tasks.findIndex((t) => t.id === id);
      if (index !== -1) {
        return { found: true, task: cloneTask(doc.tasks[index]), index, listHandle: handle };
      }
    }

    return { found: false };
  }

  return {
    async create(
      input: CreateTaskInput,
      overrideTaskId?: TaskId,
      templateId?: string,
    ): Promise<Result<TaskWithDetail>> {
      const validationErr = validateCreateTaskInput(input);
      if (validationErr) return err(validationErr);

      // Verify project exists
      const catalogDoc = catalog.doc();
      if (!catalogDoc) return err(notFound("project", input.projectId));
      const project = catalogDoc.projects.find((p) => p.id === input.projectId);
      if (!project) return err(notFound("project", input.projectId));

      const now = new Date().toISOString();
      const createdAt = input.createdAt
        ? normalizeTaskTimestamp(input.createdAt)
        : input.updatedAt
          ? normalizeTaskTimestamp(input.updatedAt)
          : now;
      const updatedAt = input.updatedAt
        ? normalizeTaskTimestamp(input.updatedAt)
        : input.createdAt
          ? normalizeTaskTimestamp(input.createdAt)
          : now;
      const id = overrideTaskId ?? createTaskId(`task-${crypto.randomUUID().slice(0, 8)}`);

      const task: Task = {
        id,
        title: input.title.trim(),
        status: input.status ?? "active",
        priority: input.priority ?? "medium",
        projectId: input.projectId,
        labels: input.labels ?? [],
        assignees: input.assignees ?? [],
        createdAt,
        updatedAt,
      };
      // Automerge doesn't allow undefined — only set optional fields if present
      if (input.dueDate !== undefined) task.dueDate = input.dueDate;
      if (input.scheduledDate !== undefined) task.scheduledDate = input.scheduledDate;
      if (input.externalId !== undefined) task.externalId = input.externalId.trim();
      if (input.sourceUrl !== undefined) task.sourceUrl = input.sourceUrl.trim();
      if (templateId !== undefined) task.templateId = templateId;

      // Add to task list document
      const listHandle = await getOrCreateTaskListDoc(input.projectId);
      listHandle.change((doc) => {
        doc.tasks.push(task);
      });

      // Create detail document if description provided
      const description = input.description?.trim();
      if (description) {
        const detailHandle = repo.create<TaskDetailDocument>();
        const template = createTaskDetailDocument(id, description);
        detailHandle.change((doc) => {
          doc.taskId = template.taskId;
          doc.description = template.description;
        });

        listHandle.change((doc) => {
          doc.detailDocIds[id] = detailHandle.documentId;
        });
      }

      return ok({ ...task, description });
    },

    async list(filter?: TaskFilter, sort?: TaskSortOptions): Promise<Result<Task[]>> {
      const validationErr = filter ? validateTaskFilter(filter) : null;
      if (validationErr) return err(validationErr);

      const catalogDoc = catalog.doc();
      if (!catalogDoc) return ok([]);

      const normalizedFilter = normalizeTaskFilter(filter);
      const allTasks: Task[] = [];

      // If filtering by project, only load that project's task list
      const docIds = normalizedFilter?.projectId
        ? [catalogDoc.taskListDocIds[normalizedFilter.projectId]].filter(Boolean)
        : Object.values(catalogDoc.taskListDocIds);

      for (const docId of docIds) {
        const handle = await loadTaskListDoc(docId);
        const doc = handle.doc();
        if (!doc) continue;

        for (const task of doc.tasks) {
          allTasks.push(cloneTask(task));
        }
      }

      // Apply filters
      let filtered = allTasks;
      if (normalizedFilter?.status) {
        const statuses = Array.isArray(normalizedFilter.status)
          ? normalizedFilter.status
          : [normalizedFilter.status];
        filtered = filtered.filter((t) => statuses.includes(t.status));
      }
      if (normalizedFilter?.priority) {
        filtered = filtered.filter((t) => t.priority === normalizedFilter.priority);
      }
      if (normalizedFilter?.label) {
        const label = normalizedFilter.label;
        filtered = filtered.filter((t) => t.labels.includes(label));
      }
      if (normalizedFilter?.createdFrom) {
        filtered = filtered.filter((t) => t.createdAt >= normalizedFilter.createdFrom!);
      }
      if (normalizedFilter?.createdTo) {
        filtered = filtered.filter((t) => t.createdAt <= normalizedFilter.createdTo!);
      }
      if (normalizedFilter?.dueBefore) {
        filtered = filtered.filter(
          (t) => t.dueDate !== undefined && t.dueDate <= normalizedFilter.dueBefore!,
        );
      }
      if (normalizedFilter?.dueAfter) {
        filtered = filtered.filter(
          (t) => t.dueDate !== undefined && t.dueDate >= normalizedFilter.dueAfter!,
        );
      }
      if (normalizedFilter?.overdue) {
        const today = new Date().toISOString().slice(0, 10);
        filtered = filtered.filter(
          (t) =>
            t.dueDate !== undefined &&
            t.dueDate < today &&
            t.status !== "done" &&
            t.status !== "canceled",
        );
      }
      if (normalizedFilter?.today) {
        const today = new Date().toISOString().slice(0, 10);
        filtered = filtered.filter(
          (t) => t.dueDate?.startsWith(today) || t.scheduledDate?.startsWith(today),
        );
      }

      // Sort
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (sort) {
        const dir = sort.direction === "asc" ? 1 : -1;
        filtered.sort((a, b) => {
          const av = getSortValue(a, sort.field, priorityOrder);
          const bv = getSortValue(b, sort.field, priorityOrder);
          // Sentinel values (\uffff) always sort last regardless of direction
          const aSentinel = av === "\uffff";
          const bSentinel = bv === "\uffff";
          if (aSentinel && !bSentinel) return 1;
          if (!aSentinel && bSentinel) return -1;
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        });
      } else {
        // Default sort: priority desc, then createdAt desc
        filtered.sort((a, b) => {
          const pd = priorityOrder[b.priority] - priorityOrder[a.priority];
          if (pd !== 0) return pd;
          return b.createdAt.localeCompare(a.createdAt);
        });
      }

      return ok(filtered);
    },

    async get(id: TaskId): Promise<Result<TaskWithDetail>> {
      const result = await findTask(id);
      if (!result.found) return err(notFound("task", id));

      // Load detail document on demand
      const listDoc = result.listHandle.doc();
      const detailDocId = listDoc?.detailDocIds[id];
      let description: string | undefined;

      if (detailDocId) {
        const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
        const detailDoc = detailHandle.doc();
        if (detailDoc) {
          description = detailDoc.description;
        }
      }

      return ok({ ...result.task, description });
    },

    async update(id: TaskId, input: UpdateTaskInput): Promise<Result<TaskWithDetail>> {
      const result = await findTask(id);
      if (!result.found) return err(notFound("task", id));

      const validationErr = validateUpdateTaskInput(input, result.task.status);
      if (validationErr) return err(validationErr);

      const updatedAt = input.updatedAt
        ? normalizeTaskTimestamp(input.updatedAt)
        : new Date().toISOString();

      // Update metadata in task list document
      result.listHandle.change((doc) => {
        const task = doc.tasks[result.index];
        if (input.title !== undefined) task.title = input.title.trim();
        if (input.status !== undefined) task.status = input.status;
        if (input.priority !== undefined) task.priority = input.priority;
        if (input.labels !== undefined) {
          // Replace labels array entirely
          task.labels.splice(0, task.labels.length, ...input.labels);
        }
        if (input.assignees !== undefined) {
          // Replace assignees array entirely
          task.assignees.splice(0, task.assignees.length, ...input.assignees);
        }
        if (input.dueDate !== undefined) task.dueDate = input.dueDate;
        if (input.scheduledDate !== undefined) task.scheduledDate = input.scheduledDate;
        if (input.externalId !== undefined) task.externalId = input.externalId.trim();
        if (input.sourceUrl !== undefined) task.sourceUrl = input.sourceUrl.trim();
        task.updatedAt = updatedAt;
      });

      // Update description in detail document if changed
      let description: string | undefined;
      if (input.description !== undefined) {
        const listDoc = result.listHandle.doc();
        const detailDocId = listDoc?.detailDocIds[id];

        if (detailDocId) {
          // Update existing detail doc
          const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
          detailHandle.change((doc) => {
            doc.description = input.description!.trim();
          });
          description = input.description.trim();
        } else if (input.description.trim()) {
          // Create new detail doc
          const detailHandle = repo.create<TaskDetailDocument>();
          const template = createTaskDetailDocument(id, input.description.trim());
          detailHandle.change((doc) => {
            doc.taskId = template.taskId;
            doc.description = template.description;
          });
          result.listHandle.change((doc) => {
            doc.detailDocIds[id] = detailHandle.documentId;
          });
          description = input.description.trim();
        }
      } else {
        // Load existing description
        const listDoc = result.listHandle.doc();
        const detailDocId = listDoc?.detailDocIds[id];
        if (detailDocId) {
          const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
          description = detailHandle.doc()?.description;
        }
      }

      // Read back updated task
      const updated = result.listHandle.doc()!.tasks[result.index];
      return ok({ ...cloneTask(updated), description });
    },

    async delete(id: TaskId): Promise<Result<void>> {
      const result = await findTask(id);
      if (!result.found) return err(notFound("task", id));

      // If this task was generated from a recurring template,
      // add its scheduled date to the template's skip list
      // so it won't be regenerated by other devices
      const task = result.task;
      if (task.templateId && task.scheduledDate) {
        const { addToSkipList } = await import("./recurring.js");
        addToSkipList(catalog, task.templateId, task.scheduledDate);
      }

      // Remove from task list
      result.listHandle.change((doc) => {
        doc.tasks.splice(result.index, 1);
        delete doc.detailDocIds[id];
      });

      // Detail and comments docs are orphaned — they'll be cleaned up
      // by a future garbage collection pass. Automerge docs without
      // references are harmless.

      return ok(undefined);
    },

    async move(id: TaskId, targetProjectId: ProjectId): Promise<Result<TaskWithDetail>> {
      // Verify target project exists
      const catalogDoc = catalog.doc();
      if (!catalogDoc) return err(notFound("project", targetProjectId));
      const targetProject = catalogDoc.projects.find((p) => p.id === targetProjectId);
      if (!targetProject) return err(notFound("project", targetProjectId));

      // Find the task
      const result = await findTask(id);
      if (!result.found) return err(notFound("task", id));

      if (result.task.projectId === targetProjectId) {
        return err(validationError("projectId", "Task is already in that project"));
      }

      const now = new Date().toISOString();
      const taskData = { ...result.task };

      // Capture detail doc ID before removing from source
      const sourceListDoc = result.listHandle.doc();
      const detailDocId = sourceListDoc?.detailDocIds[id];

      // Remove from source task list
      result.listHandle.change((doc) => {
        doc.tasks.splice(result.index, 1);
        delete doc.detailDocIds[id];
      });

      // Add to target task list
      const targetListHandle = await getOrCreateTaskListDoc(targetProjectId);
      taskData.projectId = targetProjectId;
      taskData.updatedAt = now;

      // Strip undefined fields — Automerge doesn't allow them
      const cleanTask = stripUndefined(taskData);

      targetListHandle.change((doc) => {
        doc.tasks.push(cleanTask as Task);
        if (detailDocId) {
          doc.detailDocIds[id] = detailDocId;
        }
      });

      // Load description for return value
      let description: string | undefined;
      if (detailDocId) {
        const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
        description = detailHandle.doc()?.description;
      }

      return ok({ ...taskData, description });
    },

    async search(query: string): Promise<Result<Task[]>> {
      const catalogDoc = catalog.doc();
      if (!catalogDoc) return ok([]);

      const lowerQuery = query.toLowerCase();
      const matches: Task[] = [];

      for (const docId of Object.values(catalogDoc.taskListDocIds)) {
        const handle = await loadTaskListDoc(docId);
        const doc = handle.doc();
        if (!doc) continue;

        for (const task of doc.tasks) {
          if (task.title.toLowerCase().includes(lowerQuery)) {
            matches.push(cloneTask(task));
          }
        }
      }

      return ok(matches);
    },

    _repo: repo,
  };
}

/** Clone a task out of the Automerge proxy */
function cloneTask(t: Task): Task {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    projectId: t.projectId,
    labels: [...(t.labels ?? [])],
    assignees: [...(t.assignees ?? [])],
    dueDate: t.dueDate,
    scheduledDate: t.scheduledDate,
    externalId: t.externalId,
    sourceUrl: t.sourceUrl,
    templateId: t.templateId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Get a comparable value for sorting */
function getSortValue(
  task: Task,
  field: TaskSortField,
  priorityOrder: Record<string, number>,
): string | number {
  switch (field) {
    case "priority":
      return priorityOrder[task.priority] ?? 0;
    case "dueDate":
      return task.dueDate ?? "\uffff"; // missing dates sort last
    case "createdAt":
      return task.createdAt;
    case "updatedAt":
      return task.updatedAt;
    case "title":
      return task.title.toLowerCase();
    default:
      return task.createdAt;
  }
}

/** Remove undefined values from an object — Automerge doesn't allow them */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

function normalizeTaskTimestamp(value: string): string {
  return new Date(value).toISOString();
}
