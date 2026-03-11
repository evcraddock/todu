import {
  createProjectId,
  type ExternalComment,
  type ExternalTask,
  type IntegrationBinding,
  type Note,
  type Project,
  type SyncProvider,
  type SyncProviderPushCommentLink,
  type SyncProviderPushTaskLink,
  type Task,
  type TaskPushPayload,
  type ToduError,
} from "@todu/core";
import type { Todu } from "@todu/engine";
import type { DaemonLogger } from "./logger.js";
import type { WorkerRuntime } from "./workers.js";

const DEFAULT_SYNC_INTERVAL_SECONDS = 300;
const DEFAULT_RETRY_INITIAL_SECONDS = 5;
const DEFAULT_RETRY_MAX_SECONDS = 60;
const SYNC_EXTERNAL_ID_TAG_PREFIX = "sync:externalId:";

export interface SyncPluginExecutionConfig {
  enabled: boolean;
  intervalMs: number;
  retryInitialMs: number;
  retryMaxMs: number;
  settings: Record<string, unknown>;
}

export interface ResolveSyncPluginExecutionConfigResult {
  config: SyncPluginExecutionConfig;
  warnings: string[];
}

export interface CreateSyncPluginWorkerRuntimeOptions {
  pluginName: string;
  pluginVersion: string;
  modulePath: string;
  authorityId: string;
  provider: SyncProvider;
  config: SyncPluginExecutionConfig;
  logger: DaemonLogger;
  getTodu: () => Todu | null;
  scheduler?: {
    setTimeoutFn?: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    clearTimeoutFn?: (timeout: ReturnType<typeof setTimeout>) => void;
    now?: () => number;
  };
}

export function resolveSyncPluginExecutionConfig(
  pluginName: string,
  rawConfig: Record<string, unknown> | undefined,
): ResolveSyncPluginExecutionConfigResult {
  const warnings: string[] = [];

  const enabled = parseBoolean(rawConfig?.enabled, true, warnings, "enabled", pluginName);
  const intervalMs = parseSecondsAsMs(
    rawConfig?.intervalSeconds,
    DEFAULT_SYNC_INTERVAL_SECONDS,
    warnings,
    "intervalSeconds",
    pluginName,
  );
  const retryInitialMs = parseSecondsAsMs(
    rawConfig?.retryInitialSeconds,
    DEFAULT_RETRY_INITIAL_SECONDS,
    warnings,
    "retryInitialSeconds",
    pluginName,
  );
  let retryMaxMs = parseSecondsAsMs(
    rawConfig?.retryMaxSeconds,
    DEFAULT_RETRY_MAX_SECONDS,
    warnings,
    "retryMaxSeconds",
    pluginName,
  );

  if (retryMaxMs < retryInitialMs) {
    warnings.push(
      `sync plugin config warning (${pluginName}): retryMaxSeconds is less than retryInitialSeconds; using retryInitialSeconds value`,
    );
    retryMaxMs = retryInitialMs;
  }

  const projectId = parseOptionalString(rawConfig?.projectId);
  if (projectId) {
    warnings.push(
      `sync plugin config warning (${pluginName}): projectId is ignored; shared integration bindings define project linkage`,
    );
  }

  const strategy = parseOptionalString(rawConfig?.strategy);
  if (strategy) {
    warnings.push(
      `sync plugin config warning (${pluginName}): strategy is ignored; shared integration bindings define sync strategy`,
    );
  }

  const settings = parseSettings(rawConfig?.settings, warnings, pluginName);

  return {
    config: {
      enabled,
      intervalMs,
      retryInitialMs,
      retryMaxMs,
      settings,
    },
    warnings,
  };
}

export function computeRetryDelayMs(attempt: number, config: SyncPluginExecutionConfig): number {
  const exponent = Math.max(0, attempt);
  const delay = config.retryInitialMs * 2 ** exponent;
  return Math.min(config.retryMaxMs, delay);
}

export function createSyncPluginWorkerRuntime(
  options: CreateSyncPluginWorkerRuntimeOptions,
): WorkerRuntime {
  const setTimeoutFn = options.scheduler?.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.scheduler?.clearTimeoutFn ?? clearTimeout;
  const now = options.scheduler?.now ?? (() => Date.now());
  const runtimeLogger = options.logger.child(`sync-plugin.${options.pluginName}`);

  return {
    start() {
      const config = options.config;
      let stopped = false;
      let running = false;
      let initialized = false;
      let pendingShutdown = false;
      let retryAttempt = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const scheduleNext = (delayMs: number): void => {
        if (stopped) {
          return;
        }

        timer = setTimeoutFn(() => {
          void runCycle();
        }, delayMs);
      };

      const shutdownProvider = async (): Promise<void> => {
        if (!initialized) {
          return;
        }

        initialized = false;

        try {
          await options.provider.shutdown();
        } catch (error) {
          runtimeLogger.warn("sync plugin shutdown failed", {
            pluginName: options.pluginName,
            pluginVersion: options.pluginVersion,
            modulePath: options.modulePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      const ensureInitialized = async (): Promise<void> => {
        if (initialized) {
          return;
        }

        await options.provider.initialize({
          settings: config.settings,
        });
        initialized = true;
      };

      const updateBindingStatus = async (
        activeTodu: Todu,
        binding: IntegrationBinding,
        input: {
          state?: "running" | "idle" | "blocked" | "error";
          lastAttemptedSyncAt?: string | null;
          lastSuccessfulSyncAt?: string | null;
          lastErrorSummary?: string | null;
        },
      ): Promise<void> => {
        const result = await activeTodu.integration.updateStatus(binding.id, {
          authorityId: options.authorityId,
          state: input.state,
          lastAttemptedSyncAt: input.lastAttemptedSyncAt,
          lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
          lastErrorSummary: input.lastErrorSummary,
        });

        if (!result.ok) {
          runtimeLogger.warn("sync plugin failed to update integration binding status", {
            pluginName: options.pluginName,
            pluginVersion: options.pluginVersion,
            modulePath: options.modulePath,
            bindingId: binding.id,
            error: formatToduError(result.error),
          });
        }
      };

      const runBindingCycle = async (
        activeTodu: Todu,
        binding: IntegrationBinding,
        startedAt: string,
      ): Promise<void> => {
        if (binding.strategy === "none") {
          await updateBindingStatus(activeTodu, binding, {
            state: "idle",
            lastErrorSummary: null,
          });
          return;
        }

        await updateBindingStatus(activeTodu, binding, {
          state: "running",
          lastAttemptedSyncAt: startedAt,
          lastErrorSummary: null,
        });

        const projectResult = await activeTodu.project.get(createProjectId(binding.projectId));
        if (!projectResult.ok) {
          throw new Error(`project load failed: ${formatToduError(projectResult.error)}`);
        }

        await ensureInitialized();

        if (binding.strategy === "pull" || binding.strategy === "bidirectional") {
          const pullResult = await options.provider.pull(binding, projectResult.value);

          if (pullResult.tasks.length > 0) {
            await applyPulledTasks(
              activeTodu,
              options.provider,
              projectResult.value,
              pullResult.tasks,
            );
          }

          if (pullResult.comments && pullResult.comments.length > 0) {
            await applyPulledComments(activeTodu, pullResult.comments);
          }
        }

        if (binding.strategy === "push" || binding.strategy === "bidirectional") {
          const tasksResult = await activeTodu.task.list({ projectId: projectResult.value.id });
          if (!tasksResult.ok) {
            throw new Error(`task list failed: ${formatToduError(tasksResult.error)}`);
          }

          const pushPayloads: TaskPushPayload[] = [];
          for (const task of tasksResult.value) {
            const detailResult = await activeTodu.task.get(task.id);
            const taskDetail = detailResult.ok
              ? detailResult.value
              : { ...task, description: undefined };

            const commentsResult = await activeTodu.note.list({
              entityType: "task",
              entityId: task.id,
            });
            const comments: Note[] = commentsResult.ok ? commentsResult.value : [];

            pushPayloads.push({ ...taskDetail, comments });
          }

          const pushResult = await options.provider.push(
            binding,
            pushPayloads,
            projectResult.value,
          );
          if (
            !pushResult ||
            !Array.isArray(pushResult.commentLinks) ||
            !Array.isArray(pushResult.taskLinks)
          ) {
            throw new Error("sync provider push must return { commentLinks: [], taskLinks: [] }");
          }

          await applyPushTaskLinks(activeTodu, pushResult.taskLinks);
          await applyPushCommentLinks(activeTodu, pushResult.commentLinks);
        }

        await updateBindingStatus(activeTodu, binding, {
          state: "idle",
          lastAttemptedSyncAt: startedAt,
          lastSuccessfulSyncAt: new Date(now()).toISOString(),
          lastErrorSummary: null,
        });
      };

      const runCycle = async (): Promise<void> => {
        if (stopped || running) {
          return;
        }

        running = true;
        const startedAtMs = now();
        const startedAt = new Date(startedAtMs).toISOString();

        try {
          if (!config.enabled) {
            retryAttempt = 0;
            scheduleNext(config.intervalMs);
            return;
          }

          const activeTodu = options.getTodu();
          if (!activeTodu) {
            throw new Error("daemon data host unavailable");
          }

          const bindingsResult = await activeTodu.integration.list({
            provider: options.pluginName,
            enabled: true,
          });
          if (!bindingsResult.ok) {
            throw new Error(
              `integration binding list failed: ${formatToduError(bindingsResult.error)}`,
            );
          }

          for (const binding of bindingsResult.value) {
            try {
              await runBindingCycle(activeTodu, binding, startedAt);
            } catch (error) {
              await updateBindingStatus(activeTodu, binding, {
                state: "error",
                lastAttemptedSyncAt: startedAt,
                lastErrorSummary: summarizeError(error),
              });
              throw error;
            }
          }

          retryAttempt = 0;
          runtimeLogger.info("sync plugin cycle completed", {
            pluginName: options.pluginName,
            pluginVersion: options.pluginVersion,
            modulePath: options.modulePath,
            bindingCount: bindingsResult.value.length,
            durationMs: Math.max(0, Math.round(now() - startedAtMs)),
          });

          scheduleNext(config.intervalMs);
        } catch (error) {
          const delayMs = computeRetryDelayMs(retryAttempt, config);
          retryAttempt += 1;

          runtimeLogger.warn("sync plugin cycle failed", {
            pluginName: options.pluginName,
            pluginVersion: options.pluginVersion,
            modulePath: options.modulePath,
            attempt: retryAttempt,
            nextRetryMs: delayMs,
            error: summarizeError(error),
          });

          scheduleNext(delayMs);
        } finally {
          running = false;

          if (stopped && pendingShutdown) {
            pendingShutdown = false;
            void shutdownProvider();
          }
        }
      };

      scheduleNext(0);

      return {
        stop() {
          if (stopped) {
            return;
          }

          stopped = true;

          if (timer) {
            clearTimeoutFn(timer);
            timer = null;
          }

          if (running) {
            pendingShutdown = true;
            return;
          }

          void shutdownProvider();
        },
      };
    },
  };
}

function createSyncExternalIdTag(externalId: string): string {
  return `${SYNC_EXTERNAL_ID_TAG_PREFIX}${externalId}`;
}

function getSyncExternalIdFromNote(note: Note): string | null {
  const externalIdTag = note.tags.find((tag) => tag.startsWith(SYNC_EXTERNAL_ID_TAG_PREFIX));
  if (!externalIdTag) {
    return null;
  }

  return externalIdTag.slice(SYNC_EXTERNAL_ID_TAG_PREFIX.length);
}

async function applyPushTaskLinks(todu: Todu, links: SyncProviderPushTaskLink[]): Promise<void> {
  for (const link of links) {
    const taskResult = await todu.task.get(link.localTaskId);
    if (!taskResult.ok) {
      throw new Error(
        `push task link references missing local task: task=${link.localTaskId} error=${formatToduError(taskResult.error)}`,
      );
    }

    const task = taskResult.value;
    if (task.externalId && task.externalId !== link.externalId) {
      throw new Error(
        `push task link conflicts with existing task linkage: task=${link.localTaskId} existing=${task.externalId} next=${link.externalId}`,
      );
    }

    const updateInput: {
      externalId?: string;
      sourceUrl?: string;
    } = {};

    if (!task.externalId) {
      updateInput.externalId = link.externalId;
    }

    if (link.sourceUrl !== undefined && task.sourceUrl !== link.sourceUrl) {
      updateInput.sourceUrl = link.sourceUrl;
    }

    if (updateInput.externalId === undefined && updateInput.sourceUrl === undefined) {
      continue;
    }

    const updateResult = await todu.task.update(task.id, updateInput);
    if (!updateResult.ok) {
      throw new Error(
        `push task link update failed: task=${link.localTaskId} externalId=${link.externalId} error=${formatToduError(updateResult.error)}`,
      );
    }
  }
}

function getPulledTaskTimestamp(task: ExternalTask): string | null {
  return task.updatedAt ?? task.createdAt ?? null;
}

function buildPulledTaskCreateInput(
  mappedTask: Task,
  project: Project,
  externalTask: ExternalTask,
): {
  title: string;
  projectId: Project["id"];
  status: Task["status"];
  priority: Task["priority"];
  description?: string;
  labels: string[];
  assignees: string[];
  externalId: string;
  sourceUrl?: string;
} {
  const input: {
    title: string;
    projectId: Project["id"];
    status: Task["status"];
    priority: Task["priority"];
    description?: string;
    labels: string[];
    assignees: string[];
    externalId: string;
    sourceUrl?: string;
  } = {
    title: mappedTask.title,
    projectId: project.id,
    status: mappedTask.status,
    priority: mappedTask.priority,
    labels: mappedTask.labels,
    assignees: mappedTask.assignees,
    externalId: mappedTask.externalId ?? externalTask.externalId,
  };

  if (externalTask.description !== undefined) {
    input.description = externalTask.description;
  }

  const sourceUrl = mappedTask.sourceUrl ?? externalTask.sourceUrl;
  if (sourceUrl !== undefined) {
    input.sourceUrl = sourceUrl;
  }

  return input;
}

function buildPulledTaskUpdateInput(
  mappedTask: Task,
  externalTask: ExternalTask,
): {
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  description?: string;
  labels: string[];
  assignees: string[];
  externalId: string;
  sourceUrl?: string;
} {
  const input: {
    title: string;
    status: Task["status"];
    priority: Task["priority"];
    description?: string;
    labels: string[];
    assignees: string[];
    externalId: string;
    sourceUrl?: string;
  } = {
    title: mappedTask.title,
    status: mappedTask.status,
    priority: mappedTask.priority,
    labels: mappedTask.labels,
    assignees: mappedTask.assignees,
    externalId: mappedTask.externalId ?? externalTask.externalId,
  };

  if (externalTask.description !== undefined) {
    input.description = externalTask.description;
  }

  const sourceUrl = mappedTask.sourceUrl ?? externalTask.sourceUrl;
  if (sourceUrl !== undefined) {
    input.sourceUrl = sourceUrl;
  }

  return input;
}

async function applyPulledTasks(
  todu: Todu,
  provider: SyncProvider,
  project: Project,
  tasks: ExternalTask[],
): Promise<{ created: number; updated: number; skipped: number }> {
  const stats = { created: 0, updated: 0, skipped: 0 };
  const tasksResult = await todu.task.list({ projectId: project.id });
  if (!tasksResult.ok) {
    throw new Error(`pulled task list failed: ${formatToduError(tasksResult.error)}`);
  }

  const localByExternalId = new Map<string, Task>();
  for (const task of tasksResult.value) {
    if (task.externalId) {
      localByExternalId.set(task.externalId, task);
    }
  }

  for (const externalTask of tasks) {
    const mappedTask = provider.mapToTask(externalTask, project);
    const existingTask = localByExternalId.get(externalTask.externalId);
    const externalUpdatedAt = getPulledTaskTimestamp(externalTask);

    if (!existingTask) {
      const createResult = await todu.task.create(
        buildPulledTaskCreateInput(mappedTask, project, externalTask),
      );
      if (!createResult.ok) {
        throw new Error(
          `pulled task create failed: externalId=${externalTask.externalId} error=${formatToduError(createResult.error)}`,
        );
      }

      localByExternalId.set(externalTask.externalId, createResult.value);
      stats.created += 1;
      continue;
    }

    if (externalUpdatedAt && externalUpdatedAt <= existingTask.updatedAt) {
      stats.skipped += 1;
      continue;
    }

    const updateResult = await todu.task.update(
      existingTask.id,
      buildPulledTaskUpdateInput(mappedTask, externalTask),
    );
    if (!updateResult.ok) {
      throw new Error(
        `pulled task update failed: task=${existingTask.id} externalId=${externalTask.externalId} error=${formatToduError(updateResult.error)}`,
      );
    }

    localByExternalId.set(externalTask.externalId, updateResult.value);
    stats.updated += 1;
  }

  return stats;
}

async function applyPushCommentLinks(
  todu: Todu,
  links: SyncProviderPushCommentLink[],
): Promise<void> {
  for (const link of links) {
    const notesResult = await todu.note.list({
      entityType: "task",
      entityId: link.externalTaskId,
    });
    const notes = notesResult.ok ? notesResult.value : [];
    const note = notes.find((candidate) => candidate.id === link.localNoteId);

    if (!note) {
      throw new Error(
        `push comment link references missing task note: note=${link.localNoteId} task=${link.externalTaskId}`,
      );
    }

    const existingExternalId = getSyncExternalIdFromNote(note);
    if (existingExternalId === link.externalCommentId) {
      continue;
    }

    if (existingExternalId && existingExternalId !== link.externalCommentId) {
      throw new Error(
        `push comment link conflicts with existing note linkage: note=${link.localNoteId} existing=${existingExternalId} next=${link.externalCommentId}`,
      );
    }

    await todu.note.update(note.id, {
      tags: [...note.tags, createSyncExternalIdTag(link.externalCommentId)],
    });
  }
}

/**
 * Apply comments pulled from an external provider to local todu notes.
 *
 * Uses a snapshot-based reconciliation model:
 * - Comments with an `externalId` matching an existing note's content tag are updated (last-write-wins by updatedAt).
 * - Comments without a local match are created as new notes.
 * - Local notes with external ID tags that are absent from the pull result are deleted.
 *
 * External IDs are tracked via a `sync:externalId:<value>` tag on each note.
 */
async function applyPulledComments(
  todu: Todu,
  comments: ExternalComment[],
): Promise<{ created: number; updated: number; deleted: number }> {
  const stats = { created: 0, updated: 0, deleted: 0 };

  // Group pulled comments by task
  const commentsByTask = new Map<string, ExternalComment[]>();
  for (const comment of comments) {
    const taskId = comment.externalTaskId;
    const existing = commentsByTask.get(taskId);
    if (existing) {
      existing.push(comment);
    } else {
      commentsByTask.set(taskId, [comment]);
    }
  }

  // Collect all task IDs that have at least one pulled comment
  const affectedTaskIds = new Set(commentsByTask.keys());

  // For each affected task, reconcile local notes with pulled comments
  for (const taskId of affectedTaskIds) {
    const pulledComments = commentsByTask.get(taskId) ?? [];
    const localNotesResult = await todu.note.list({
      entityType: "task",
      entityId: taskId,
    });
    const localNotes: Note[] = localNotesResult.ok ? localNotesResult.value : [];

    // Build index of local notes by external ID tag
    const localByExternalId = new Map<string, Note>();
    for (const note of localNotes) {
      const externalId = getSyncExternalIdFromNote(note);
      if (externalId) {
        localByExternalId.set(externalId, note);
      }
    }

    // Build set of pulled external IDs for delete detection
    const pulledExternalIds = new Set(pulledComments.map((c) => c.externalId));

    // Create or update pulled comments
    for (const pulled of pulledComments) {
      const localNote = localByExternalId.get(pulled.externalId);

      if (!localNote) {
        // Create new note
        await todu.note.create({
          content: pulled.body,
          author: pulled.author ?? "external",
          entityType: "task",
          entityId: taskId,
          tags: [createSyncExternalIdTag(pulled.externalId)],
        });
        stats.created++;
      } else {
        // Update if external is newer (last-write-wins by updatedAt)
        const externalUpdatedAt = pulled.updatedAt ?? pulled.createdAt;
        const localCreatedAt = localNote.createdAt;

        if (externalUpdatedAt > localCreatedAt) {
          await todu.note.update(localNote.id, {
            content: pulled.body,
          });
          stats.updated++;
        }
      }
    }

    // Delete local synced notes whose external IDs are absent from pull result
    for (const [externalId, note] of localByExternalId) {
      if (!pulledExternalIds.has(externalId)) {
        await todu.note.delete(note.id);
        stats.deleted++;
      }
    }
  }

  return stats;
}

function formatToduError(error: ToduError): string {
  switch (error.type) {
    case "not-found":
      return `${error.entity} not found: ${error.id}`;
    case "storage":
      return error.message;
    case "validation":
      return `${error.field}: ${error.message}`;
  }
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseSettings(
  value: unknown,
  warnings: string[],
  pluginName: string,
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  warnings.push(
    `sync plugin config warning (${pluginName}): settings must be an object; using empty settings`,
  );
  return {};
}

function parseBoolean(
  value: unknown,
  fallback: boolean,
  warnings: string[],
  field: string,
  pluginName: string,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  warnings.push(
    `sync plugin config warning (${pluginName}): ${field} must be boolean; using ${String(fallback)}`,
  );

  return fallback;
}

function parseSecondsAsMs(
  value: unknown,
  fallbackSeconds: number,
  warnings: string[],
  field: string,
  pluginName: string,
): number {
  if (value === undefined) {
    return fallbackSeconds * 1_000;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    warnings.push(
      `sync plugin config warning (${pluginName}): ${field} must be a positive number; using ${fallbackSeconds}`,
    );
    return fallbackSeconds * 1_000;
  }

  return Math.max(1, Math.round(value * 1_000));
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
