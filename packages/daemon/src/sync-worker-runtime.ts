import crypto from "node:crypto";
import {
  type Actor,
  type ActorId,
  type AnySyncProvider,
  createActorId,
  createProjectId,
  type ExportedCommentInput,
  type ExportedTaskInput,
  type ExternalActorRef,
  type ExternalComment,
  type ExternalTask,
  type ImportedCommentInput,
  type ImportedContentApproval,
  type ImportedTaskInput,
  type IntegrationBinding,
  type IntegrationBindingActorMapping,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTE_CONTENT_LENGTH,
  type Note,
  type Project,
  SYNC_PROVIDER_API_VERSION_V2,
  SYNC_PROVIDER_API_VERSION_V3,
  type SyncProviderPushCommentLink,
  type SyncProviderPushTaskLink,
  type SyncProviderV2,
  type SyncProviderV3,
  type Task,
  type TaskPushPayload,
  type ToduError,
} from "@todu/core";
import type { Todu, ToduWithInternalTools } from "@todu/engine";
import type { DaemonLogger } from "./logger.js";
import type { WorkerRuntime } from "./workers.js";

const DEFAULT_SYNC_INTERVAL_SECONDS = 300;
const DEFAULT_RETRY_INITIAL_SECONDS = 5;
const DEFAULT_RETRY_MAX_SECONDS = 60;
const SYNC_EXTERNAL_ID_TAG_PREFIX = "sync:externalId:";
const TRUNCATION_SUFFIX = "... [truncated]";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

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
  provider: AnySyncProvider;
  providerApiVersion?: number;
  config: SyncPluginExecutionConfig;
  logger: DaemonLogger;
  getTodu: () => Todu | null;
  scheduler?: {
    setTimeoutFn?: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    clearTimeoutFn?: (timeout: ReturnType<typeof setTimeout>) => void;
    now?: () => number;
  };
}

interface SyncBindingActorState {
  binding: IntegrationBinding;
  actorMappings: IntegrationBindingActorMapping[];
  actorsById: Map<string, Actor>;
  mappingsChanged: boolean;
}

interface RuntimeImportedTask {
  externalId: string;
  title: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  labels?: string[];
  assignees?: ExternalActorRef[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RuntimeImportedComment {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: ExternalActorRef;
  createdAt: string;
  updatedAt?: string;
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
  const providerApiVersion = options.providerApiVersion ?? SYNC_PROVIDER_API_VERSION_V2;

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

        let project = projectResult.value;
        const actorState = await createBindingActorState(activeTodu, binding);

        await ensureInitialized();

        if (binding.strategy === "pull" || binding.strategy === "bidirectional") {
          if (providerApiVersion === SYNC_PROVIDER_API_VERSION_V2) {
            const provider = options.provider as SyncProviderV2;
            const pullResult = await provider.pull(binding, project);

            if (pullResult.tasks.length > 0) {
              const pullStats = await applyPulledTasksV2(
                activeTodu,
                actorState,
                provider,
                project,
                pullResult.tasks,
              );
              project = pullStats.project;
            }

            if (pullResult.comments && pullResult.comments.length > 0) {
              await applyPulledCommentsV2(activeTodu, actorState, project.id, pullResult.comments);
            }
          } else if (providerApiVersion === SYNC_PROVIDER_API_VERSION_V3) {
            const provider = options.provider as SyncProviderV3;
            const pullResult = await provider.pull(binding, project);

            if (pullResult.tasks.length > 0) {
              const pullStats = await applyPulledTasksV3(
                activeTodu,
                actorState,
                project,
                pullResult.tasks,
              );
              project = pullStats.project;
            }

            if (pullResult.comments && pullResult.comments.length > 0) {
              await applyPulledCommentsV3(activeTodu, actorState, project.id, pullResult.comments);
            }
          } else {
            throw new Error(
              `unsupported sync provider API version at runtime: ${providerApiVersion}`,
            );
          }
        }

        if (binding.strategy === "push" || binding.strategy === "bidirectional") {
          if (providerApiVersion === SYNC_PROVIDER_API_VERSION_V2) {
            const provider = options.provider as SyncProviderV2;
            const pushPayloads = await buildPushPayloadsV2(
              activeTodu,
              actorState,
              project,
              runtimeLogger,
            );
            const pushResult = await provider.push(binding, pushPayloads, project);
            if (
              !pushResult ||
              !Array.isArray(pushResult.commentLinks) ||
              !Array.isArray(pushResult.taskLinks)
            ) {
              throw new Error("sync provider push must return { commentLinks: [], taskLinks: [] }");
            }

            await applyPushTaskLinks(activeTodu, pushResult.taskLinks);
            await applyPushCommentLinks(activeTodu, pushResult.commentLinks);
          } else if (providerApiVersion === SYNC_PROVIDER_API_VERSION_V3) {
            const provider = options.provider as SyncProviderV3;
            const pushPayloads = await buildPushPayloadsV3(
              activeTodu,
              actorState,
              project,
              runtimeLogger,
            );
            const pushResult = await provider.push(binding, pushPayloads, project);
            if (
              !pushResult ||
              !Array.isArray(pushResult.commentLinks) ||
              !Array.isArray(pushResult.taskLinks)
            ) {
              throw new Error("sync provider push must return { commentLinks: [], taskLinks: [] }");
            }

            await applyPushTaskLinks(activeTodu, pushResult.taskLinks);
            await applyPushCommentLinks(activeTodu, pushResult.commentLinks);
          } else {
            throw new Error(
              `unsupported sync provider API version at runtime: ${providerApiVersion}`,
            );
          }
        }

        if (actorState.mappingsChanged) {
          await persistBindingActorMappings(activeTodu, actorState);
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
            providerApiVersion,
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
            providerApiVersion,
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

function normalizeImportedTaskTimestamp(
  task: RuntimeImportedTask,
  field: "createdAt" | "updatedAt",
): string | null {
  const value = task[field];
  if (value === undefined) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(
      `pulled task has invalid ${field}: externalId=${task.externalId} value=${value}`,
    );
  }

  return timestamp.toISOString();
}

function getImportedTaskTimestamps(task: RuntimeImportedTask): {
  createdAt?: string;
  updatedAt?: string;
  comparisonTimestamp: string | null;
} {
  const createdAt = normalizeImportedTaskTimestamp(task, "createdAt");
  const updatedAt = normalizeImportedTaskTimestamp(task, "updatedAt");
  const effectiveCreatedAt = createdAt ?? updatedAt ?? undefined;
  const effectiveUpdatedAt = updatedAt ?? createdAt ?? undefined;

  return {
    createdAt: effectiveCreatedAt,
    updatedAt: effectiveUpdatedAt,
    comparisonTimestamp: effectiveUpdatedAt ?? null,
  };
}

async function applyPulledTasksV2(
  todu: Todu,
  actorState: SyncBindingActorState,
  provider: SyncProviderV2,
  project: Project,
  tasks: ExternalTask[],
): Promise<{ created: number; updated: number; skipped: number; project: Project }> {
  const importedTasks = tasks.map((externalTask) => {
    const mappedTask = provider.mapToTask(externalTask, project);
    return {
      externalId: mappedTask.externalId ?? externalTask.externalId,
      title: mappedTask.title,
      description: externalTask.description,
      status: mappedTask.status,
      priority: mappedTask.priority,
      labels: mappedTask.labels,
      assignees: mappedTask.assignees.map(createV2ExternalActorRef),
      sourceUrl: mappedTask.sourceUrl ?? externalTask.sourceUrl,
      createdAt: externalTask.createdAt,
      updatedAt: externalTask.updatedAt,
    } satisfies RuntimeImportedTask;
  });

  return applyImportedTasks(todu, actorState, project, importedTasks);
}

async function applyPulledTasksV3(
  todu: Todu,
  actorState: SyncBindingActorState,
  project: Project,
  tasks: ImportedTaskInput[],
): Promise<{ created: number; updated: number; skipped: number; project: Project }> {
  const importedTasks = tasks.map((task) => ({
    externalId: task.externalId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    labels: task.labels,
    assignees: task.assignees,
    sourceUrl: task.sourceUrl,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  })) satisfies RuntimeImportedTask[];

  return applyImportedTasks(todu, actorState, project, importedTasks);
}

async function applyImportedTasks(
  todu: Todu,
  actorState: SyncBindingActorState,
  project: Project,
  tasks: RuntimeImportedTask[],
): Promise<{ created: number; updated: number; skipped: number; project: Project }> {
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

  let currentProject = project;

  for (const importedTask of tasks) {
    const existingTask = localByExternalId.get(importedTask.externalId);
    const pulledTimestamps = getImportedTaskTimestamps(importedTask);
    const externalUpdatedAt = pulledTimestamps.comparisonTimestamp;
    const assigneeResolution = await resolveImportedAssignees(
      todu,
      actorState,
      importedTask.assignees,
    );

    currentProject = await ensureProjectAuthorizedAssigneeActors(
      todu,
      currentProject,
      assigneeResolution.actorIds,
    );

    const compatibilityAssignees = assigneeResolution.actorIds.map((actorId) =>
      getActorDisplayName(actorState, actorId),
    );

    if (!existingTask) {
      const createInput: {
        title: string;
        projectId: Project["id"];
        status: Task["status"];
        priority: Task["priority"];
        description?: string;
        descriptionApproval?: ImportedContentApproval;
        labels: string[];
        assigneeActorIds: ActorId[];
        assignees: string[];
        externalId: string;
        sourceUrl?: string;
        createdAt?: string;
        updatedAt?: string;
      } = {
        title: importedTask.title,
        projectId: currentProject.id,
        status: importedTask.status ?? "active",
        priority: importedTask.priority ?? "medium",
        labels: importedTask.labels ?? [],
        assigneeActorIds: assigneeResolution.actorIds,
        assignees: compatibilityAssignees,
        externalId: importedTask.externalId,
      };

      if (importedTask.description !== undefined) {
        createInput.description = truncate(importedTask.description, MAX_DESCRIPTION_LENGTH);
        createInput.descriptionApproval = buildImportedContentApproval(actorState.binding.id);
      }

      if (importedTask.sourceUrl !== undefined) {
        createInput.sourceUrl = importedTask.sourceUrl;
      }
      if (pulledTimestamps.createdAt !== undefined) {
        createInput.createdAt = pulledTimestamps.createdAt;
      }
      if (pulledTimestamps.updatedAt !== undefined) {
        createInput.updatedAt = pulledTimestamps.updatedAt;
      }

      const createResult = await todu.task.create(createInput);
      if (!createResult.ok) {
        throw new Error(
          `pulled task create failed: externalId=${importedTask.externalId} error=${formatToduError(createResult.error)}`,
        );
      }

      localByExternalId.set(importedTask.externalId, createResult.value);
      stats.created += 1;
      continue;
    }

    if (externalUpdatedAt && externalUpdatedAt <= existingTask.updatedAt) {
      stats.skipped += 1;
      continue;
    }

    const updateInput: {
      title: string;
      status: Task["status"];
      priority: Task["priority"];
      description?: string;
      descriptionApproval?: ImportedContentApproval;
      labels: string[];
      assigneeActorIds: ActorId[];
      assignees: string[];
      externalId: string;
      sourceUrl?: string;
      updatedAt?: string;
    } = {
      title: importedTask.title,
      status: importedTask.status ?? "active",
      priority: importedTask.priority ?? "medium",
      labels: importedTask.labels ?? [],
      assigneeActorIds: assigneeResolution.actorIds,
      assignees: compatibilityAssignees,
      externalId: importedTask.externalId,
    };

    if (importedTask.description !== undefined) {
      updateInput.description = truncate(importedTask.description, MAX_DESCRIPTION_LENGTH);
      updateInput.descriptionApproval = buildImportedContentApproval(actorState.binding.id);
    }

    if (importedTask.sourceUrl !== undefined) {
      updateInput.sourceUrl = importedTask.sourceUrl;
    }
    if (pulledTimestamps.updatedAt !== undefined) {
      updateInput.updatedAt = pulledTimestamps.updatedAt;
    }

    const updateResult = await todu.task.update(existingTask.id, updateInput);
    if (!updateResult.ok) {
      throw new Error(
        `pulled task update failed: task=${existingTask.id} externalId=${importedTask.externalId} error=${formatToduError(updateResult.error)}`,
      );
    }

    localByExternalId.set(importedTask.externalId, updateResult.value);
    stats.updated += 1;
  }

  return {
    ...stats,
    project: currentProject,
  };
}

async function applyPulledCommentsV2(
  todu: Todu,
  actorState: SyncBindingActorState,
  projectId: Project["id"],
  comments: ExternalComment[],
): Promise<{ created: number; updated: number; deleted: number }> {
  const importedComments = comments.map((comment) => ({
    externalId: comment.externalId,
    externalTaskId: comment.externalTaskId,
    body: comment.body,
    author: comment.author ? createV2ExternalActorRef(comment.author) : undefined,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  })) satisfies RuntimeImportedComment[];

  return applyImportedComments(todu, actorState, projectId, importedComments);
}

async function applyPulledCommentsV3(
  todu: Todu,
  actorState: SyncBindingActorState,
  projectId: Project["id"],
  comments: ImportedCommentInput[],
): Promise<{ created: number; updated: number; deleted: number }> {
  const importedComments = comments.map((comment) => ({
    externalId: comment.externalId,
    externalTaskId: comment.externalTaskId,
    body: comment.body,
    author: comment.author,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  })) satisfies RuntimeImportedComment[];

  return applyImportedComments(todu, actorState, projectId, importedComments);
}

async function applyImportedComments(
  todu: Todu,
  actorState: SyncBindingActorState,
  projectId: Project["id"],
  comments: RuntimeImportedComment[],
): Promise<{ created: number; updated: number; deleted: number }> {
  const stats = { created: 0, updated: 0, deleted: 0 };

  const tasksResult = await todu.task.list({ projectId });
  if (!tasksResult.ok) {
    throw new Error(`task list failed for pulled comments: ${formatToduError(tasksResult.error)}`);
  }

  const localTaskIdByExternalId = new Map<string, Task["id"]>();
  for (const task of tasksResult.value) {
    if (task.externalId) {
      localTaskIdByExternalId.set(task.externalId, task.id);
    }
  }

  const commentsByTask = new Map<string, RuntimeImportedComment[]>();
  for (const comment of comments) {
    const localTaskId = localTaskIdByExternalId.get(comment.externalTaskId);
    if (!localTaskId) {
      continue;
    }

    const existing = commentsByTask.get(localTaskId);
    if (existing) {
      existing.push(comment);
    } else {
      commentsByTask.set(localTaskId, [comment]);
    }
  }

  for (const taskId of commentsByTask.keys()) {
    const pulledComments = commentsByTask.get(taskId) ?? [];
    const localNotesResult = await todu.note.list({
      entityType: "task",
      entityId: taskId,
    });
    const localNotes: Note[] = localNotesResult.ok ? localNotesResult.value : [];

    const localByExternalId = new Map<string, Note>();
    for (const note of localNotes) {
      const externalId = getSyncExternalIdFromNote(note);
      if (externalId) {
        localByExternalId.set(externalId, note);
      }
    }

    const pulledExternalIds = new Set(pulledComments.map((comment) => comment.externalId));

    for (const pulled of pulledComments) {
      const localNote = localByExternalId.get(pulled.externalId);
      const authorResolution = pulled.author
        ? await resolveImportedActor(todu, actorState, pulled.author)
        : null;
      const approval = buildImportedContentApproval(
        actorState.binding.id,
        authorResolution?.actor.id,
        authorResolution?.trusted ?? false,
      );

      if (!localNote) {
        const createResult = await todu.note.create({
          content: truncate(pulled.body, MAX_NOTE_CONTENT_LENGTH),
          author: authorResolution?.actor.displayName ?? "external",
          authorActorId: authorResolution?.actor.id,
          contentApproval: approval,
          entityType: "task",
          entityId: taskId,
          tags: [createSyncExternalIdTag(pulled.externalId)],
          createdAt: normalizeImportedCommentTimestamp(pulled, "createdAt"),
        });
        if (!createResult.ok) {
          throw new Error(
            `pulled comment create failed: externalId=${pulled.externalId} error=${formatToduError(createResult.error)}`,
          );
        }
        stats.created += 1;
      } else {
        const externalUpdatedAt = normalizeImportedCommentTimestamp(
          pulled,
          pulled.updatedAt !== undefined ? "updatedAt" : "createdAt",
        );
        const localCreatedAt = localNote.createdAt;

        if (externalUpdatedAt > localCreatedAt) {
          const updateResult = await todu.note.update(localNote.id, {
            content: truncate(pulled.body, MAX_NOTE_CONTENT_LENGTH),
            authorActorId: authorResolution?.actor.id,
            contentApproval: approval,
          });
          if (!updateResult.ok) {
            throw new Error(
              `pulled comment update failed: note=${localNote.id} externalId=${pulled.externalId} error=${formatToduError(updateResult.error)}`,
            );
          }
          stats.updated += 1;
        }
      }
    }

    for (const [externalId, note] of localByExternalId) {
      if (!pulledExternalIds.has(externalId)) {
        const deleteResult = await todu.note.delete(note.id);
        if (!deleteResult.ok) {
          throw new Error(
            `pulled comment delete failed: note=${note.id} externalId=${externalId} error=${formatToduError(deleteResult.error)}`,
          );
        }
        stats.deleted += 1;
      }
    }
  }

  return stats;
}

async function buildPushPayloadsV2(
  todu: Todu,
  actorState: SyncBindingActorState,
  project: Project,
  logger: DaemonLogger,
): Promise<TaskPushPayload[]> {
  const tasksResult = await todu.task.list({ projectId: project.id });
  if (!tasksResult.ok) {
    throw new Error(`task list failed: ${formatToduError(tasksResult.error)}`);
  }

  const pushPayloads: TaskPushPayload[] = [];
  for (const task of tasksResult.value) {
    const detailResult = await todu.task.get(task.id);
    const taskDetail = detailResult.ok ? detailResult.value : { ...task, description: undefined };

    const commentsResult = await todu.note.list({
      entityType: "task",
      entityId: task.id,
    });
    const comments: Note[] = commentsResult.ok ? commentsResult.value : [];

    const mappedAssignees = buildOutboundV2Assignees(taskDetail, actorState, logger);
    pushPayloads.push({
      ...taskDetail,
      assignees: taskDetail.assigneeActorIds.length > 0 ? mappedAssignees : taskDetail.assignees,
      comments,
    });
  }

  return pushPayloads;
}

async function buildPushPayloadsV3(
  todu: Todu,
  actorState: SyncBindingActorState,
  project: Project,
  logger: DaemonLogger,
): Promise<ExportedTaskInput[]> {
  const tasksResult = await todu.task.list({ projectId: project.id });
  if (!tasksResult.ok) {
    throw new Error(`task list failed: ${formatToduError(tasksResult.error)}`);
  }

  const pushPayloads: ExportedTaskInput[] = [];
  for (const task of tasksResult.value) {
    const detailResult = await todu.task.get(task.id);
    const taskDetail = detailResult.ok ? detailResult.value : { ...task, description: undefined };

    const commentsResult = await todu.note.list({
      entityType: "task",
      entityId: task.id,
    });
    const comments: Note[] = commentsResult.ok ? commentsResult.value : [];

    pushPayloads.push({
      localTaskId: taskDetail.id,
      externalId: taskDetail.externalId,
      title: taskDetail.title,
      description: taskDetail.description,
      status: taskDetail.status,
      priority: taskDetail.priority,
      labels: taskDetail.labels,
      assignees: buildOutboundV3Assignees(taskDetail, actorState, logger),
      sourceUrl: taskDetail.sourceUrl,
      comments: comments.map((comment) => {
        const exported: ExportedCommentInput = {
          localNoteId: comment.id,
          body: comment.content,
          createdAt: comment.createdAt,
        };
        return exported;
      }),
    });
  }

  return pushPayloads;
}

async function createBindingActorState(
  todu: Todu,
  binding: IntegrationBinding,
): Promise<SyncBindingActorState> {
  const internalTodu = getToduWithInternals(todu);
  const actorsResult = await internalTodu.__internal.syncRuntime.actors.list();
  if (!actorsResult.ok) {
    throw new Error(`actor list failed: ${formatToduError(actorsResult.error)}`);
  }

  return {
    binding,
    actorMappings: cloneActorMappings(binding),
    actorsById: new Map(actorsResult.value.map((actor) => [actor.id, actor])),
    mappingsChanged: false,
  };
}

async function persistBindingActorMappings(
  todu: Todu,
  actorState: SyncBindingActorState,
): Promise<void> {
  const updateResult = await todu.integration.update(actorState.binding.id, {
    options: {
      ...(actorState.binding.options ?? {}),
      actorMappings: actorState.actorMappings,
    },
  });

  if (!updateResult.ok) {
    throw new Error(
      `integration binding mapping update failed: binding=${actorState.binding.id} error=${formatToduError(updateResult.error)}`,
    );
  }

  actorState.binding = updateResult.value;
  actorState.mappingsChanged = false;
}

async function resolveImportedAssignees(
  todu: Todu,
  actorState: SyncBindingActorState,
  assignees: ExternalActorRef[] | undefined,
): Promise<{ actorIds: ActorId[] }> {
  const actorIds: ActorId[] = [];
  const seen = new Set<string>();

  for (const assignee of assignees ?? []) {
    const resolution = await resolveImportedActor(todu, actorState, assignee);
    if (!seen.has(resolution.actor.id)) {
      seen.add(resolution.actor.id);
      actorIds.push(resolution.actor.id);
    }
  }

  return { actorIds };
}

async function resolveImportedActor(
  todu: Todu,
  actorState: SyncBindingActorState,
  actorRef: ExternalActorRef,
): Promise<{ actor: Actor; trusted: boolean }> {
  const normalizedActorRef = normalizeExternalActorRef(actorRef);
  const existingMapping = findActorMapping(actorState.actorMappings, normalizedActorRef);

  if (existingMapping) {
    const actor = await ensureRuntimeActor(todu, actorState, {
      id: createActorId(existingMapping.actorId),
      displayName: getPreferredExternalActorDisplayName(normalizedActorRef),
    });
    return {
      actor,
      trusted: existingMapping.trusted === true,
    };
  }

  const actorId = createStableImportedActorId(actorState.binding, normalizedActorRef);
  const actor = await ensureRuntimeActor(todu, actorState, {
    id: actorId,
    displayName: getPreferredExternalActorDisplayName(normalizedActorRef),
  });

  actorState.actorMappings.push({
    actorId,
    ...(normalizedActorRef.externalAccountId !== undefined
      ? { externalAccountId: normalizedActorRef.externalAccountId }
      : {}),
    ...(normalizedActorRef.externalLogin !== undefined
      ? { externalLogin: normalizedActorRef.externalLogin }
      : {}),
    ...(normalizedActorRef.displayName !== undefined
      ? { displayName: normalizedActorRef.displayName }
      : {}),
    trusted: false,
  });
  actorState.mappingsChanged = true;

  return {
    actor,
    trusted: false,
  };
}

async function ensureRuntimeActor(
  todu: Todu,
  actorState: SyncBindingActorState,
  input: { id: ReturnType<typeof createActorId>; displayName: string },
): Promise<Actor> {
  const cachedActor = actorState.actorsById.get(input.id);
  if (cachedActor) {
    return cachedActor;
  }

  const internalTodu = getToduWithInternals(todu);
  const ensureResult = await internalTodu.__internal.syncRuntime.actors.ensure(input);
  if (!ensureResult.ok) {
    throw new Error(`actor ensure failed: ${formatToduError(ensureResult.error)}`);
  }

  actorState.actorsById.set(ensureResult.value.id, ensureResult.value);
  return ensureResult.value;
}

async function ensureProjectAuthorizedAssigneeActors(
  todu: Todu,
  project: Project,
  actorIds: readonly ActorId[],
): Promise<Project> {
  const nextAuthorizedAssigneeActorIds = [...project.authorizedAssigneeActorIds];
  let changed = false;

  for (const actorId of actorIds) {
    if (!nextAuthorizedAssigneeActorIds.includes(actorId)) {
      nextAuthorizedAssigneeActorIds.push(actorId);
      changed = true;
    }
  }

  if (!changed) {
    return project;
  }

  const updateResult = await todu.project.update(project.id, {
    authorizedAssigneeActorIds: nextAuthorizedAssigneeActorIds,
  });
  if (!updateResult.ok) {
    throw new Error(
      `project authorized assignee update failed: project=${project.id} error=${formatToduError(updateResult.error)}`,
    );
  }

  return updateResult.value;
}

function buildOutboundV2Assignees(
  task: Task,
  actorState: SyncBindingActorState,
  logger: DaemonLogger,
): string[] {
  const assignees: string[] = [];

  for (const actorId of task.assigneeActorIds) {
    const mapping = actorState.actorMappings.find((candidate) => candidate.actorId === actorId);
    const outboundAssignee = mapping ? getOutboundV2Assignee(mapping) : null;

    if (!mapping || !outboundAssignee) {
      logger.warn("sync plugin skipped unmapped outbound assignee", {
        bindingId: actorState.binding.id,
        provider: actorState.binding.provider,
        taskId: task.id,
        taskTitle: task.title,
        actorId,
      });
      continue;
    }

    assignees.push(outboundAssignee);
  }

  return assignees;
}

function buildOutboundV3Assignees(
  task: Task,
  actorState: SyncBindingActorState,
  logger: DaemonLogger,
): ExternalActorRef[] {
  const assignees: ExternalActorRef[] = [];

  for (const actorId of task.assigneeActorIds) {
    const mapping = actorState.actorMappings.find((candidate) => candidate.actorId === actorId);
    const outboundAssignee = mapping ? getOutboundV3Assignee(mapping) : null;

    if (!mapping || !outboundAssignee) {
      logger.warn("sync plugin skipped unmapped outbound assignee", {
        bindingId: actorState.binding.id,
        provider: actorState.binding.provider,
        taskId: task.id,
        taskTitle: task.title,
        actorId,
      });
      continue;
    }

    assignees.push(outboundAssignee);
  }

  return assignees;
}

function getOutboundV2Assignee(mapping: IntegrationBindingActorMapping): string | null {
  return mapping.externalLogin ?? mapping.displayName ?? mapping.externalAccountId ?? null;
}

function getOutboundV3Assignee(mapping: IntegrationBindingActorMapping): ExternalActorRef | null {
  const outboundAssignee: ExternalActorRef = {};

  if (mapping.externalAccountId !== undefined) {
    outboundAssignee.externalAccountId = mapping.externalAccountId;
  }
  if (mapping.externalLogin !== undefined) {
    outboundAssignee.externalLogin = mapping.externalLogin;
  }
  if (mapping.displayName !== undefined) {
    outboundAssignee.displayName = mapping.displayName;
  }

  return Object.keys(outboundAssignee).length > 0 ? outboundAssignee : null;
}

function normalizeExternalActorRef(actorRef: ExternalActorRef): ExternalActorRef {
  return {
    ...(parseOptionalString(actorRef.externalAccountId) !== undefined
      ? { externalAccountId: parseOptionalString(actorRef.externalAccountId)! }
      : {}),
    ...(parseOptionalString(actorRef.externalLogin) !== undefined
      ? { externalLogin: parseOptionalString(actorRef.externalLogin)! }
      : {}),
    ...(parseOptionalString(actorRef.displayName) !== undefined
      ? { displayName: parseOptionalString(actorRef.displayName)! }
      : {}),
    ...(actorRef.raw !== undefined ? { raw: actorRef.raw } : {}),
  };
}

function createV2ExternalActorRef(value: string): ExternalActorRef {
  const normalizedValue = value.trim();
  return {
    externalLogin: normalizedValue,
    displayName: normalizedValue,
    raw: value,
  };
}

function createStableImportedActorId(
  binding: IntegrationBinding,
  actorRef: ExternalActorRef,
): ReturnType<typeof createActorId> {
  const uniqueKey = getExternalActorIdentityKey(actorRef);
  const hash = crypto
    .createHash("sha1")
    .update(`${binding.id}:${binding.provider}:${uniqueKey}`)
    .digest("hex")
    .slice(0, 16);
  return createActorId(`actor-imported-${hash}`);
}

function getExternalActorIdentityKey(actorRef: ExternalActorRef): string {
  const externalAccountId = normalizeExternalAccountId(actorRef.externalAccountId);
  if (externalAccountId) {
    return `account:${externalAccountId}`;
  }

  const externalLogin = normalizeExternalLogin(actorRef.externalLogin);
  if (externalLogin) {
    return `login:${externalLogin}`;
  }

  const displayName = normalizeExternalDisplayName(actorRef.displayName);
  if (displayName) {
    return `display:${displayName}`;
  }

  return `raw:${crypto
    .createHash("sha1")
    .update(JSON.stringify(actorRef.raw ?? actorRef))
    .digest("hex")}`;
}

function findActorMapping(
  actorMappings: IntegrationBindingActorMapping[],
  actorRef: ExternalActorRef,
): IntegrationBindingActorMapping | null {
  const externalAccountId = normalizeExternalAccountId(actorRef.externalAccountId);
  if (externalAccountId) {
    const byAccountId = actorMappings.find(
      (mapping) => normalizeExternalAccountId(mapping.externalAccountId) === externalAccountId,
    );
    if (byAccountId) {
      return byAccountId;
    }
  }

  const externalLogin = normalizeExternalLogin(actorRef.externalLogin);
  if (externalLogin) {
    const byLogin = actorMappings.find(
      (mapping) => normalizeExternalLogin(mapping.externalLogin) === externalLogin,
    );
    if (byLogin) {
      return byLogin;
    }
  }

  const displayName = normalizeExternalDisplayName(actorRef.displayName);
  if (displayName) {
    const byDisplayName = actorMappings.find(
      (mapping) => normalizeExternalDisplayName(mapping.displayName) === displayName,
    );
    if (byDisplayName) {
      return byDisplayName;
    }
  }

  return null;
}

function getPreferredExternalActorDisplayName(actorRef: ExternalActorRef): string {
  return actorRef.displayName ?? actorRef.externalLogin ?? actorRef.externalAccountId ?? "external";
}

function normalizeExternalAccountId(value: string | undefined): string | null {
  const normalized = parseOptionalString(value);
  return normalized ?? null;
}

function normalizeExternalLogin(value: string | undefined): string | null {
  const normalized = parseOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeExternalDisplayName(value: string | undefined): string | null {
  const normalized = parseOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function buildImportedContentApproval(
  bindingId: IntegrationBinding["id"],
  sourceActorId?: Actor["id"],
  trusted = false,
): ImportedContentApproval {
  return {
    state: trusted ? "notRequired" : "pendingApproval",
    sourceBindingId: bindingId,
    ...(sourceActorId !== undefined ? { sourceActorId } : {}),
  };
}

function cloneActorMappings(binding: IntegrationBinding): IntegrationBindingActorMapping[] {
  return (binding.options?.actorMappings ?? []).map((mapping) => ({
    actorId: mapping.actorId,
    ...(mapping.externalAccountId !== undefined
      ? { externalAccountId: mapping.externalAccountId }
      : {}),
    ...(mapping.externalLogin !== undefined ? { externalLogin: mapping.externalLogin } : {}),
    ...(mapping.displayName !== undefined ? { displayName: mapping.displayName } : {}),
    ...(mapping.trusted !== undefined ? { trusted: mapping.trusted } : {}),
  }));
}

function getActorDisplayName(actorState: SyncBindingActorState, actorId: string): string {
  return actorState.actorsById.get(actorId)?.displayName ?? actorId;
}

function normalizeImportedCommentTimestamp(
  comment: RuntimeImportedComment,
  field: "createdAt" | "updatedAt",
): string {
  const value =
    field === "updatedAt" ? (comment.updatedAt ?? comment.createdAt) : comment.createdAt;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(
      `pulled comment has invalid ${field}: externalId=${comment.externalId} value=${value}`,
    );
  }

  return timestamp.toISOString();
}

function getToduWithInternals(todu: Todu): ToduWithInternalTools {
  const internalTodu = todu as ToduWithInternalTools;
  if (!internalTodu.__internal?.syncRuntime?.actors) {
    throw new Error("daemon sync runtime requires engine syncRuntime actor internals");
  }

  return internalTodu;
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
