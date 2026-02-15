import crypto from "node:crypto";
import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateRecurringInput,
  type CreateTaskInput,
  createRecurringId,
  err,
  generateScheduledTaskId,
  notFound,
  ok,
  type ProjectId,
  type RecurringFilter,
  type RecurringId,
  type RecurringTemplate,
  type Result,
  type Task,
  type TaskListDocument,
  type UpdateRecurringInput,
  validateCreateRecurringInput,
  validateUpdateRecurringInput,
  validationError,
} from "@todu/core";
import {
  describeSchedule,
  isScheduledDate,
  nextOccurrence,
  nextOccurrences,
  todayInTimezone,
} from "./schedule.js";
import { registerProcessor } from "./scheduling.js";
import { createTaskNamespace } from "./tasks.js";
import type { RecurringNamespace } from "./todu.js";

// ============================================================================
// Recurring template namespace — CRUD + task generation
// ============================================================================

export function createRecurringNamespace(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): RecurringNamespace {
  const taskNs = createTaskNamespace(catalog, repo);

  return {
    async create(input: CreateRecurringInput): Promise<Result<RecurringTemplate>> {
      const validationErr = validateCreateRecurringInput(input);
      if (validationErr) return err(validationErr);

      // Verify project exists
      const doc = catalog.doc();
      if (doc) {
        const project = doc.projects.find((p) => p.id === input.projectId);
        if (!project) return err(notFound("project", input.projectId));
      }

      const now = new Date().toISOString();
      const id = createRecurringId(`rec-${crypto.randomUUID().slice(0, 8)}`);

      // Calculate initial nextDue from RRULE + startDate
      const today = todayInTimezone(input.timezone);
      let initialNextDue: string;

      if (input.startDate >= today) {
        // Start date is in the future or today — check if startDate itself is an occurrence
        initialNextDue = input.startDate;
      } else {
        // Start date is in the past — find next occurrence after yesterday
        // (so today is included if it's an occurrence)
        const yesterday = shiftDate(today, -1);
        const next = nextOccurrence(
          input.schedule,
          input.startDate,
          input.timezone,
          yesterday,
          input.endDate,
        );
        initialNextDue = next || input.startDate; // fallback shouldn't happen for valid schedules
      }

      const template: RecurringTemplate = {
        id,
        title: input.title.trim(),
        projectId: input.projectId,
        labels: input.labels || [],
        priority: input.priority || "medium",
        schedule: input.schedule,
        timezone: input.timezone,
        startDate: input.startDate,
        nextDue: initialNextDue,
        skippedDates: [],
        paused: false,
        createdAt: now,
        updatedAt: now,
      };

      if (input.description !== undefined) {
        template.description = input.description;
      }
      if (input.endDate !== undefined) {
        template.endDate = input.endDate;
      }

      catalog.change((doc) => {
        doc.recurringTemplates.push(template);
      });

      return ok(template);
    },

    async list(filter?: RecurringFilter): Promise<Result<RecurringTemplate[]>> {
      const doc = catalog.doc();
      if (!doc) return ok([]);

      let templates = doc.recurringTemplates.map(cloneTemplate);

      if (filter?.paused !== undefined) {
        templates = templates.filter((t) => t.paused === filter.paused);
      }
      if (filter?.projectId !== undefined) {
        templates = templates.filter((t) => t.projectId === filter.projectId);
      }
      if (filter?.search) {
        const lowerQuery = filter.search.toLowerCase();
        templates = templates.filter((t) => t.title.toLowerCase().includes(lowerQuery));
      }

      return ok(templates);
    },

    async get(id: RecurringId): Promise<Result<RecurringTemplate>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("recurring template", id));

      const template = doc.recurringTemplates.find((t) => t.id === id);
      if (!template) return err(notFound("recurring template", id));

      return ok(cloneTemplate(template));
    },

    async update(id: RecurringId, input: UpdateRecurringInput): Promise<Result<RecurringTemplate>> {
      const validationErr = validateUpdateRecurringInput(input);
      if (validationErr) return err(validationErr);

      const doc = catalog.doc();
      if (!doc) return err(notFound("recurring template", id));

      const index = doc.recurringTemplates.findIndex((t) => t.id === id);
      if (index === -1) return err(notFound("recurring template", id));

      // If changing project, verify it exists
      if (input.projectId !== undefined) {
        const project = doc.projects.find((p) => p.id === input.projectId);
        if (!project) return err(notFound("project", input.projectId));
      }

      const scheduleChanged = input.schedule !== undefined || input.timezone !== undefined;

      catalog.change((doc) => {
        const t = doc.recurringTemplates[index];
        if (input.title !== undefined) t.title = input.title.trim();
        if (input.description !== undefined) t.description = input.description;
        if (input.projectId !== undefined) t.projectId = input.projectId;
        if (input.labels !== undefined) t.labels = input.labels;
        if (input.priority !== undefined) t.priority = input.priority;
        if (input.schedule !== undefined) t.schedule = input.schedule;
        if (input.timezone !== undefined) t.timezone = input.timezone;
        if (input.endDate !== undefined) t.endDate = input.endDate;
        if (input.paused !== undefined) t.paused = input.paused;
        t.updatedAt = new Date().toISOString();
      });

      // Recalculate nextDue if schedule changed
      if (scheduleChanged) {
        const updated = catalog.doc()!.recurringTemplates[index];
        const today = todayInTimezone(updated.timezone);
        const yesterday = shiftDate(today, -1);
        const next = nextOccurrence(
          updated.schedule,
          updated.startDate,
          updated.timezone,
          yesterday,
          updated.endDate,
        );
        if (next) {
          catalog.change((doc) => {
            doc.recurringTemplates[index].nextDue = next;
          });
        }
      }

      const result = catalog.doc()!.recurringTemplates[index];
      return ok(cloneTemplate(result));
    },

    async delete(id: RecurringId): Promise<Result<void>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("recurring template", id));

      const index = doc.recurringTemplates.findIndex((t) => t.id === id);
      if (index === -1) return err(notFound("recurring template", id));

      catalog.change((doc) => {
        doc.recurringTemplates.splice(index, 1);
      });

      return ok(undefined);
    },

    async pause(id: RecurringId): Promise<Result<RecurringTemplate>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("recurring template", id));

      const index = doc.recurringTemplates.findIndex((t) => t.id === id);
      if (index === -1) return err(notFound("recurring template", id));

      catalog.change((doc) => {
        doc.recurringTemplates[index].paused = true;
        doc.recurringTemplates[index].updatedAt = new Date().toISOString();
      });

      return ok(cloneTemplate(catalog.doc()!.recurringTemplates[index]));
    },

    async resume(id: RecurringId): Promise<Result<RecurringTemplate>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("recurring template", id));

      const index = doc.recurringTemplates.findIndex((t) => t.id === id);
      if (index === -1) return err(notFound("recurring template", id));

      // Recalculate nextDue on resume
      const template = doc.recurringTemplates[index];
      const today = todayInTimezone(template.timezone);
      const yesterday = shiftDate(today, -1);
      const next = nextOccurrence(
        template.schedule,
        template.startDate,
        template.timezone,
        yesterday,
        template.endDate,
      );

      catalog.change((doc) => {
        doc.recurringTemplates[index].paused = false;
        if (next) {
          doc.recurringTemplates[index].nextDue = next;
        }
        doc.recurringTemplates[index].updatedAt = new Date().toISOString();
      });

      return ok(cloneTemplate(catalog.doc()!.recurringTemplates[index]));
    },

    async upcoming(options?: {
      templateId?: RecurringId;
      days?: number;
    }): Promise<Result<UpcomingOccurrence[]>> {
      const doc = catalog.doc();
      if (!doc) return ok([]);

      const days = options?.days ?? 14;
      const results: UpcomingOccurrence[] = [];

      const templates = options?.templateId
        ? doc.recurringTemplates.filter((t) => t.id === options.templateId)
        : doc.recurringTemplates.filter((t) => !t.paused);

      for (const template of templates) {
        const today = todayInTimezone(template.timezone);
        const endDate = shiftDate(today, days);
        const effectiveEnd =
          template.endDate && template.endDate < endDate ? template.endDate : endDate;

        const dates = nextOccurrences(
          template.schedule,
          template.startDate,
          template.timezone,
          today,
          days + 1, // request more than needed, we'll filter by date
          effectiveEnd,
        );

        for (const date of dates) {
          if (date > endDate) break;
          results.push({
            templateId: template.id,
            title: template.title,
            date,
            projectId: template.projectId,
            priority: template.priority,
            schedule: describeSchedule(template.schedule),
          });
        }
      }

      // Sort by date
      results.sort((a, b) => a.date.localeCompare(b.date));

      return ok(results);
    },

    async generate(templateId: RecurringId, date: string): Promise<Result<Task>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("recurring template", templateId));

      const template = doc.recurringTemplates.find((t) => t.id === templateId);
      if (!template) return err(notFound("recurring template", templateId));

      // Validate the date is a valid occurrence
      if (
        !isScheduledDate(
          template.schedule,
          template.startDate,
          template.timezone,
          date,
          template.endDate,
        )
      ) {
        return err(validationError("date", `${date} is not a valid occurrence for this template`));
      }

      // Generate the task with deterministic ID
      return generateTaskFromTemplate(template, date, catalog, taskNs);
    },

    async process(): Promise<Result<Task[]>> {
      return processRecurringTemplates(catalog, taskNs);
    },
  };
}

// ============================================================================
// Upcoming occurrence type
// ============================================================================

export interface UpcomingOccurrence {
  templateId: RecurringId;
  title: string;
  date: string;
  projectId: ProjectId;
  priority: string;
  schedule: string;
}

// ============================================================================
// Task generation from templates
// ============================================================================

async function generateTaskFromTemplate(
  template: RecurringTemplate,
  date: string,
  catalog: DocHandle<CatalogDocument>,
  taskNs: ReturnType<typeof createTaskNamespace>,
): Promise<Result<Task>> {
  const taskId = generateScheduledTaskId(template.id, date);

  // Check if task already exists
  const doc = catalog.doc();
  if (doc) {
    for (const docId of Object.values(doc.taskListDocIds)) {
      const handle = await taskNs._repo.find<TaskListDocument>(docId as DocumentId);
      const listDoc = handle.doc();
      if (listDoc) {
        const existing = listDoc.tasks.find((t) => t.id === taskId);
        if (existing) return ok(existing);
      }
    }
  }

  // Create the task
  const input: CreateTaskInput = {
    title: template.title,
    projectId: template.projectId,
    priority: template.priority,
    labels: [...template.labels],
    scheduledDate: date,
    description: template.description,
  };

  const result = await taskNs.create(input, taskId, template.id);
  if (!result.ok) return result;

  return ok(result.value);
}

/**
 * Process all due recurring templates — called by the scheduling framework.
 * Generates tasks for all missed occurrences (catch-up behavior).
 */
async function processRecurringTemplates(
  catalog: DocHandle<CatalogDocument>,
  taskNs: ReturnType<typeof createTaskNamespace>,
): Promise<Result<Task[]>> {
  const doc = catalog.doc();
  if (!doc) return ok([]);

  const created: Task[] = [];

  for (let i = 0; i < doc.recurringTemplates.length; i++) {
    const template = doc.recurringTemplates[i];
    if (template.paused) continue;

    const today = todayInTimezone(template.timezone);
    let currentNextDue = template.nextDue;

    // Generate tasks for all due dates (catch-up)
    while (currentNextDue <= today) {
      // Check skip list
      if (!template.skippedDates.includes(currentNextDue)) {
        const result = await generateTaskFromTemplate(template, currentNextDue, catalog, taskNs);
        if (result.ok) {
          created.push(result.value);
        }
      }

      // Advance to next occurrence
      const next = nextOccurrence(
        template.schedule,
        template.startDate,
        template.timezone,
        currentNextDue,
        template.endDate,
      );

      if (!next) break; // No more occurrences
      currentNextDue = next;
    }

    // Update nextDue in catalog
    if (currentNextDue !== template.nextDue) {
      catalog.change((doc) => {
        doc.recurringTemplates[i].nextDue = currentNextDue;
      });
    }
  }

  return ok(created);
}

/**
 * Register the recurring template processor with the scheduling framework.
 * Called once during module initialization.
 */
export function registerRecurringProcessor(catalog: DocHandle<CatalogDocument>, repo: Repo): void {
  const taskNs = createTaskNamespace(catalog, repo);

  registerProcessor("recurring", async () => {
    const result = await processRecurringTemplates(catalog, taskNs);
    return result.ok ? result.value.length : 0;
  });
}

/**
 * Add a date to a template's skip list.
 * Called when a generated task is deleted.
 */
export function addToSkipList(
  catalog: DocHandle<CatalogDocument>,
  templateId: string,
  date: string,
): void {
  const doc = catalog.doc();
  if (!doc) return;

  const index = doc.recurringTemplates.findIndex((t) => t.id === templateId);
  if (index === -1) return;

  const template = doc.recurringTemplates[index];
  if (template.skippedDates.includes(date)) return;

  catalog.change((doc) => {
    doc.recurringTemplates[index].skippedDates.push(date);
  });
}

// ============================================================================
// Helpers
// ============================================================================

function cloneTemplate(t: RecurringTemplate): RecurringTemplate {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    projectId: t.projectId,
    labels: [...t.labels],
    priority: t.priority,
    schedule: t.schedule,
    timezone: t.timezone,
    startDate: t.startDate,
    endDate: t.endDate,
    nextDue: t.nextDue,
    skippedDates: [...t.skippedDates],
    paused: t.paused,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
