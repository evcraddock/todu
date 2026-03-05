import {
  createProjectId,
  isSyncStrategy,
  type SyncProvider,
  type SyncStrategy,
  type ToduError,
} from "@todu/core";
import type { Todu } from "@todu/engine";
import type { DaemonLogger } from "./logger.js";
import type { WorkerRuntime } from "./workers.js";

const DEFAULT_SYNC_INTERVAL_SECONDS = 300;
const DEFAULT_RETRY_INITIAL_SECONDS = 5;
const DEFAULT_RETRY_MAX_SECONDS = 60;

export interface SyncPluginExecutionConfig {
  enabled: boolean;
  projectId?: string;
  strategy: SyncStrategy;
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
  const projectId = parseOptionalString(rawConfig?.projectId);
  const strategy = parseStrategy(rawConfig?.strategy, warnings, pluginName);

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

  const settings = parseSettings(rawConfig?.settings, warnings, pluginName);

  return {
    config: {
      enabled,
      projectId,
      strategy,
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
      let missingProjectWarningLogged = false;
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

      const runCycle = async (): Promise<void> => {
        if (stopped || running) {
          return;
        }

        running = true;
        const startedAtMs = now();

        try {
          if (!config.enabled) {
            retryAttempt = 0;
            scheduleNext(config.intervalMs);
            return;
          }

          if (config.strategy === "none") {
            retryAttempt = 0;
            scheduleNext(config.intervalMs);
            return;
          }

          if (!config.projectId) {
            if (!missingProjectWarningLogged) {
              runtimeLogger.warn("sync plugin projectId is not configured; skipping sync cycle", {
                pluginName: options.pluginName,
                pluginVersion: options.pluginVersion,
                modulePath: options.modulePath,
              });
              missingProjectWarningLogged = true;
            }

            retryAttempt = 0;
            scheduleNext(config.intervalMs);
            return;
          }

          const activeTodu = options.getTodu();
          if (!activeTodu) {
            throw new Error("daemon data host unavailable");
          }

          missingProjectWarningLogged = false;

          if (!initialized) {
            await options.provider.initialize({
              projectId: config.projectId,
              strategy: config.strategy,
              settings: config.settings,
            });
            initialized = true;
          }

          const projectResult = await activeTodu.project.get(createProjectId(config.projectId));
          if (!projectResult.ok) {
            throw new Error(`project load failed: ${formatToduError(projectResult.error)}`);
          }

          if (config.strategy === "pull" || config.strategy === "bidirectional") {
            await options.provider.pull(projectResult.value);
          }

          if (config.strategy === "push" || config.strategy === "bidirectional") {
            const tasksResult = await activeTodu.task.list({ projectId: projectResult.value.id });
            if (!tasksResult.ok) {
              throw new Error(`task list failed: ${formatToduError(tasksResult.error)}`);
            }

            await options.provider.push(tasksResult.value, projectResult.value);
          }

          retryAttempt = 0;
          runtimeLogger.info("sync plugin cycle completed", {
            pluginName: options.pluginName,
            pluginVersion: options.pluginVersion,
            modulePath: options.modulePath,
            strategy: config.strategy,
            projectId: config.projectId,
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
            strategy: config.strategy,
            projectId: config.projectId ?? null,
            attempt: retryAttempt,
            nextRetryMs: delayMs,
            error: error instanceof Error ? error.message : String(error),
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

function parseStrategy(value: unknown, warnings: string[], pluginName: string): SyncStrategy {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "bidirectional";
  }

  const normalized = value.trim().toLowerCase();
  if (isSyncStrategy(normalized)) {
    return normalized;
  }

  warnings.push(
    `sync plugin config warning (${pluginName}): strategy must be one of bidirectional/pull/push/none; using bidirectional`,
  );

  return "bidirectional";
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
