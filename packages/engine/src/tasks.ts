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
  type ImportedContentApproval,
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
  type ValidationError,
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
    if (filter.updatedFrom !== undefined) {
      normalized.updatedFrom = normalizeRangeBoundary(filter.updatedFrom, "start", filter.timezone);
    }
    if (filter.updatedTo !== undefined) {
      normalized.updatedTo = normalizeRangeBoundary(filter.updatedTo, "end", filter.timezone);
    }

    return normalized;
  }

  function createContentFingerprint(content: string): string {
    return `sha1:${crypto.createHash("sha1").update(content).digest("hex")}`;
  }

  function normalizeContentApproval(
    content: string,
    approval?: ImportedContentApproval,
  ): ImportedContentApproval {
    return {
      ...(approval ?? { state: "notRequired" }),
      sourceFingerprint: createContentFingerprint(content),
    };
  }

  function normalizeTaskSearchText(content: string): string {
    return content.trim().toLowerCase();
  }

  function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function approvalsEqual(
    left: ImportedContentApproval | undefined,
    right: ImportedContentApproval | undefined,
  ): boolean {
    return (
      left?.state === right?.state &&
      left?.sourceBindingId === right?.sourceBindingId &&
      left?.sourceActorId === right?.sourceActorId &&
      left?.sourceFingerprint === right?.sourceFingerprint &&
      left?.reviewedAt === right?.reviewedAt &&
      left?.reviewedByActorId === right?.reviewedByActorId
    );
  }

  function taskMatchesSearch(task: Task, descriptionSearchText: string, query: string): boolean {
    const normalizedQuery = normalizeTaskSearchText(query);
    if (normalizedQuery.length === 0) return true;

    return (
      task.title.toLowerCase().includes(normalizedQuery) ||
      descriptionSearchText.includes(normalizedQuery)
    );
  }

  function findMissingActorId(actorIds: readonly string[]): string | null {
    const catalogDoc = catalog.doc();
    if (!catalogDoc) return actorIds[0] ?? null;

    const catalogActorIds = new Set<string>(catalogDoc.actors.map((actor) => actor.id));
    return actorIds.find((actorId) => !catalogActorIds.has(actorId)) ?? null;
  }

  function validateAuthorizedAssigneeActorIds(
    project: { authorizedAssigneeActorIds: string[] },
    assigneeActorIds: readonly string[],
  ): ValidationError | null {
    const authorized = new Set(project.authorizedAssigneeActorIds);
    const unauthorizedActorId = assigneeActorIds.find((actorId) => !authorized.has(actorId));
    if (!unauthorizedActorId) return null;

    return validationError(
      "assigneeActorIds",
      `Actor is not authorized for project assignment: ${unauthorizedActorId}`,
    );
  }

  function migrateTaskListDoc(handle: DocHandle<TaskListDocument>): void {
    const doc = handle.doc();
    if (!doc) return;

    const tasks = doc.tasks ?? [];
    const needsMigration =
      doc.detailDocIds === undefined ||
      doc.detailDocIds === null ||
      doc.descriptionSearchTextByTaskId === undefined ||
      doc.descriptionSearchTextByTaskId === null ||
      tasks.some((task) => task.labels === undefined || task.labels === null) ||
      tasks.some((task) => task.assigneeActorIds === undefined || task.assigneeActorIds === null) ||
      tasks.some((task) => task.assignees === undefined || task.assignees === null);

    if (!needsMigration) return;

    handle.change((d) => {
      if (d.detailDocIds === undefined || d.detailDocIds === null) {
        d.detailDocIds = {};
      }
      if (
        d.descriptionSearchTextByTaskId === undefined ||
        d.descriptionSearchTextByTaskId === null
      ) {
        d.descriptionSearchTextByTaskId = {};
      }
      for (const task of d.tasks) {
        if (task.labels === undefined || task.labels === null) {
          task.labels = [];
        }
        if (task.assigneeActorIds === undefined || task.assigneeActorIds === null) {
          task.assigneeActorIds = [];
        }
        if (task.assignees === undefined || task.assignees === null) {
          task.assignees = [];
        }
      }
    });
  }

  async function backfillDescriptionSearchIndex(
    handle: DocHandle<TaskListDocument>,
  ): Promise<void> {
    const doc = handle.doc();
    if (!doc) return;

    const existingTaskIds = new Set(doc.tasks.map((task) => task.id));
    const updates: Record<string, string | null> = {};

    for (const indexedTaskId of Object.keys(doc.descriptionSearchTextByTaskId)) {
      if (!existingTaskIds.has(indexedTaskId as TaskId) || !doc.detailDocIds[indexedTaskId]) {
        updates[indexedTaskId] = null;
      }
    }

    for (const [taskId, detailDocId] of Object.entries(doc.detailDocIds)) {
      if (!existingTaskIds.has(taskId as TaskId)) {
        updates[taskId] = null;
        continue;
      }

      if (doc.descriptionSearchTextByTaskId[taskId] !== undefined) {
        continue;
      }

      const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
      const detailDoc = detailHandle.doc();
      const searchText = detailDoc ? normalizeTaskSearchText(detailDoc.description) : "";
      updates[taskId] = searchText.length > 0 ? searchText : null;
    }

    if (Object.keys(updates).length === 0) return;

    handle.change((d) => {
      for (const [taskId, searchText] of Object.entries(updates)) {
        if (searchText === null) {
          delete d.descriptionSearchTextByTaskId[taskId];
        } else {
          d.descriptionSearchTextByTaskId[taskId] = searchText;
        }
      }
    });
  }

  async function loadTaskListDoc(docId: string): Promise<DocHandle<TaskListDocument>> {
    const handle = await repo.find<TaskListDocument>(docId as DocumentId);
    migrateTaskListDoc(handle);
    await backfillDescriptionSearchIndex(handle);
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
      doc.descriptionSearchTextByTaskId = template.descriptionSearchTextByTaskId;
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

      if (input.assigneeActorIds !== undefined) {
        const missingActorId = findMissingActorId(input.assigneeActorIds);
        if (missingActorId) return err(notFound("actor", missingActorId));

        const authorizationError = validateAuthorizedAssigneeActorIds(
          project,
          input.assigneeActorIds,
        );
        if (authorizationError) return err(authorizationError);
      }

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
        assigneeActorIds: input.assigneeActorIds ?? [],
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
      let descriptionApproval: ImportedContentApproval | undefined;
      if (description) {
        descriptionApproval = normalizeContentApproval(description, input.descriptionApproval);
        const detailHandle = repo.create<TaskDetailDocument>();
        const template = createTaskDetailDocument(id, description, descriptionApproval);
        detailHandle.change((doc) => {
          doc.taskId = template.taskId;
          doc.description = template.description;
          if (template.descriptionApproval !== undefined) {
            doc.descriptionApproval = template.descriptionApproval;
          }
        });

        listHandle.change((doc) => {
          doc.detailDocIds[id] = detailHandle.documentId;
          doc.descriptionSearchTextByTaskId[id] = normalizeTaskSearchText(description);
        });
      }

      return ok({ ...task, description, descriptionApproval });
    },

    async list(filter?: TaskFilter, sort?: TaskSortOptions): Promise<Result<Task[]>> {
      const validationErr = filter ? validateTaskFilter(filter) : null;
      if (validationErr) return err(validationErr);

      const catalogDoc = catalog.doc();
      if (!catalogDoc) return ok([]);

      const normalizedFilter = normalizeTaskFilter(filter);
      const allTasks: Task[] = [];
      const searchQuery = normalizedFilter?.search;

      // If filtering by project, only load that project's task list
      const docIds = normalizedFilter?.projectId
        ? [catalogDoc.taskListDocIds[normalizedFilter.projectId]].filter(Boolean)
        : Object.values(catalogDoc.taskListDocIds);

      for (const docId of docIds) {
        const handle = await loadTaskListDoc(docId);
        const doc = handle.doc();
        if (!doc) continue;

        for (const task of doc.tasks) {
          if (
            searchQuery !== undefined &&
            !taskMatchesSearch(task, doc.descriptionSearchTextByTaskId[task.id] ?? "", searchQuery)
          ) {
            continue;
          }

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
      if (normalizedFilter?.updatedFrom) {
        filtered = filtered.filter((t) => t.updatedAt >= normalizedFilter.updatedFrom!);
      }
      if (normalizedFilter?.updatedTo) {
        filtered = filtered.filter((t) => t.updatedAt <= normalizedFilter.updatedTo!);
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
      let descriptionApproval: ImportedContentApproval | undefined;

      if (detailDocId) {
        const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
        const detailDoc = detailHandle.doc();
        if (detailDoc) {
          description = detailDoc.description;
          descriptionApproval = normalizeContentApproval(
            detailDoc.description,
            detailDoc.descriptionApproval,
          );
        }
      }

      return ok({ ...result.task, description, descriptionApproval });
    },

    async update(id: TaskId, input: UpdateTaskInput): Promise<Result<TaskWithDetail>> {
      const result = await findTask(id);
      if (!result.found) return err(notFound("task", id));

      const validationErr = validateUpdateTaskInput(input, result.task.status);
      if (validationErr) return err(validationErr);

      const catalogDoc = catalog.doc();
      if (!catalogDoc) return err(notFound("project", result.task.projectId));
      const project = catalogDoc.projects.find((p) => p.id === result.task.projectId);
      if (!project) return err(notFound("project", result.task.projectId));

      if (input.assigneeActorIds !== undefined) {
        const missingActorId = findMissingActorId(input.assigneeActorIds);
        if (missingActorId) return err(notFound("actor", missingActorId));

        const authorizationError = validateAuthorizedAssigneeActorIds(
          project,
          input.assigneeActorIds,
        );
        if (authorizationError) return err(authorizationError);
      }

      const updatedAt = input.updatedAt
        ? normalizeTaskTimestamp(input.updatedAt)
        : new Date().toISOString();
      const currentTask = result.task;
      const title = input.title?.trim();
      const externalId = input.externalId?.trim();
      const sourceUrl = input.sourceUrl?.trim();
      const metadataChanged =
        (title !== undefined && title !== currentTask.title) ||
        (input.status !== undefined && input.status !== currentTask.status) ||
        (input.priority !== undefined && input.priority !== currentTask.priority) ||
        (input.labels !== undefined && !arraysEqual(input.labels, currentTask.labels)) ||
        (input.assigneeActorIds !== undefined &&
          !arraysEqual(input.assigneeActorIds, currentTask.assigneeActorIds)) ||
        (input.assignees !== undefined && !arraysEqual(input.assignees, currentTask.assignees)) ||
        (input.dueDate !== undefined && input.dueDate !== currentTask.dueDate) ||
        (input.scheduledDate !== undefined && input.scheduledDate !== currentTask.scheduledDate) ||
        (externalId !== undefined && externalId !== currentTask.externalId) ||
        (sourceUrl !== undefined && sourceUrl !== currentTask.sourceUrl);
      const timestampChanged = input.updatedAt !== undefined && updatedAt !== currentTask.updatedAt;

      let description: string | undefined;
      let descriptionApproval: ImportedContentApproval | undefined;
      const detailDocId = result.listHandle.doc()?.detailDocIds[id];
      let createdDetailDocId: DocumentId | undefined;
      let contentChanged = false;

      if (detailDocId) {
        const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
        const currentDetail = detailHandle.doc();

        if (
          currentDetail &&
          (input.description !== undefined || input.descriptionApproval !== undefined)
        ) {
          const nextDescription =
            input.description !== undefined ? input.description.trim() : currentDetail.description;
          const nextApproval = normalizeContentApproval(nextDescription, input.descriptionApproval);
          contentChanged =
            nextDescription !== currentDetail.description ||
            !approvalsEqual(nextApproval, currentDetail.descriptionApproval);

          if (contentChanged) {
            detailHandle.change((doc) => {
              doc.description = nextDescription;
              doc.descriptionApproval = nextApproval;
            });
          }
        }

        const detailDoc = detailHandle.doc();
        description = detailDoc?.description;
        if (detailDoc?.description !== undefined) {
          descriptionApproval = normalizeContentApproval(
            detailDoc.description,
            detailDoc.descriptionApproval,
          );
        }
      } else if (input.description?.trim()) {
        const descriptionText = input.description.trim();
        descriptionApproval = normalizeContentApproval(descriptionText, input.descriptionApproval);
        const detailHandle = repo.create<TaskDetailDocument>();
        const template = createTaskDetailDocument(id, descriptionText, descriptionApproval);
        detailHandle.change((doc) => {
          doc.taskId = template.taskId;
          doc.description = template.description;
          if (template.descriptionApproval !== undefined) {
            doc.descriptionApproval = template.descriptionApproval;
          }
        });
        createdDetailDocId = detailHandle.documentId;
        description = descriptionText;
        contentChanged = true;
      } else if (input.descriptionApproval !== undefined) {
        return err(
          validationError(
            "descriptionApproval",
            "Cannot update description approval without an existing description",
          ),
        );
      }

      const searchText =
        description !== undefined ? normalizeTaskSearchText(description) : undefined;
      const currentSearchText = result.listHandle.doc()?.descriptionSearchTextByTaskId[id];
      const searchIndexChanged =
        searchText !== undefined &&
        (searchText.length > 0
          ? searchText !== currentSearchText
          : currentSearchText !== undefined);
      const taskListChanged =
        metadataChanged || timestampChanged || contentChanged || searchIndexChanged;

      if (taskListChanged) {
        result.listHandle.change((doc) => {
          const task = doc.tasks[result.index];
          if (title !== undefined && title !== task.title) task.title = title;
          if (input.status !== undefined && input.status !== task.status)
            task.status = input.status;
          if (input.priority !== undefined && input.priority !== task.priority) {
            task.priority = input.priority;
          }
          if (input.labels !== undefined && !arraysEqual(input.labels, task.labels)) {
            task.labels.splice(0, task.labels.length, ...input.labels);
          }
          if (
            input.assigneeActorIds !== undefined &&
            !arraysEqual(input.assigneeActorIds, task.assigneeActorIds)
          ) {
            task.assigneeActorIds.splice(
              0,
              task.assigneeActorIds.length,
              ...input.assigneeActorIds,
            );
          }
          if (input.assignees !== undefined && !arraysEqual(input.assignees, task.assignees)) {
            task.assignees.splice(0, task.assignees.length, ...input.assignees);
          }
          if (input.dueDate !== undefined && input.dueDate !== task.dueDate) {
            task.dueDate = input.dueDate;
          }
          if (input.scheduledDate !== undefined && input.scheduledDate !== task.scheduledDate) {
            task.scheduledDate = input.scheduledDate;
          }
          if (externalId !== undefined && externalId !== task.externalId) {
            task.externalId = externalId;
          }
          if (sourceUrl !== undefined && sourceUrl !== task.sourceUrl) {
            task.sourceUrl = sourceUrl;
          }
          if (metadataChanged || timestampChanged || contentChanged) {
            task.updatedAt = updatedAt;
          }
          if (createdDetailDocId) {
            doc.detailDocIds[id] = createdDetailDocId;
          }
          if (searchText !== undefined) {
            if (searchText.length > 0 && searchText !== currentSearchText) {
              doc.descriptionSearchTextByTaskId[id] = searchText;
            } else if (searchText.length === 0 && currentSearchText !== undefined) {
              delete doc.descriptionSearchTextByTaskId[id];
            }
          }
        });
      }

      // Read back updated task
      const updated = result.listHandle.doc()!.tasks[result.index];
      return ok({ ...cloneTask(updated), description, descriptionApproval });
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
        delete doc.descriptionSearchTextByTaskId[id];
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
      const sourceDescriptionSearchText = sourceListDoc?.descriptionSearchTextByTaskId[id];
      result.listHandle.change((doc) => {
        doc.tasks.splice(result.index, 1);
        delete doc.detailDocIds[id];
        delete doc.descriptionSearchTextByTaskId[id];
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
        if (sourceDescriptionSearchText) {
          doc.descriptionSearchTextByTaskId[id] = sourceDescriptionSearchText;
        }
      });

      // Load description for return value
      let description: string | undefined;
      let descriptionApproval: ImportedContentApproval | undefined;
      if (detailDocId) {
        const detailHandle = await repo.find<TaskDetailDocument>(detailDocId as DocumentId);
        const detailDoc = detailHandle.doc();
        description = detailDoc?.description;
        if (detailDoc?.description !== undefined) {
          descriptionApproval = normalizeContentApproval(
            detailDoc.description,
            detailDoc.descriptionApproval,
          );
        }
      }

      return ok({ ...taskData, description, descriptionApproval });
    },

    async search(query: string): Promise<Result<Task[]>> {
      const catalogDoc = catalog.doc();
      if (!catalogDoc) return ok([]);

      const lowerQuery = normalizeTaskSearchText(query);
      if (lowerQuery.length === 0) return ok([]);

      const matches: Task[] = [];

      for (const docId of Object.values(catalogDoc.taskListDocIds)) {
        const handle = await loadTaskListDoc(docId);
        const doc = handle.doc();
        if (!doc) continue;

        for (const task of doc.tasks) {
          const descriptionSearchText = doc.descriptionSearchTextByTaskId[task.id] ?? "";
          if (taskMatchesSearch(task, descriptionSearchText, lowerQuery)) {
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
    assigneeActorIds: [...(t.assigneeActorIds ?? [])],
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
