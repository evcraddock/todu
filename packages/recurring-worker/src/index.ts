import type { WorkerPluginRegistration } from "@todu/core";
import type { Todu } from "@todu/engine";

export const DEFAULT_RECURRING_WORKER_INTERVAL_MS = 30_000;

export const workerPlugin: WorkerPluginRegistration = {
  manifest: {
    name: "recurring-worker",
    version: "1.0.0",
    worker: {
      type: "recurring",
      requiredDomains: ["recurring", "task"],
      roleHints: ["node"],
    },
  },

  createRuntime(context) {
    const intervalMs = resolveIntervalMs(context.config);

    return {
      start() {
        let stopped = false;
        let running = false;
        let timer: ReturnType<typeof setInterval> | null = null;

        const runOnce = async (trigger: "startup" | "interval") => {
          if (stopped || running) {
            return;
          }

          const activeTodu = readTodu(context.getTodu());
          if (!activeTodu) {
            return;
          }

          running = true;

          try {
            const result = await activeTodu.recurring.process();
            if (!result.ok) {
              context.logger.warn("recurring worker process returned error", {
                trigger,
                error: describeResultError(result.error),
              });
              return;
            }

            if (result.value.length > 0) {
              context.logger.info("recurring worker generated due occurrences", {
                trigger,
                generatedCount: result.value.length,
              });
            }
          } catch (error) {
            context.logger.error("recurring worker run failed", {
              trigger,
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            running = false;
          }
        };

        timer = setInterval(() => {
          void runOnce("interval");
        }, intervalMs);

        void runOnce("startup");

        return {
          stop() {
            if (stopped) {
              return;
            }

            stopped = true;

            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          },
        };
      },
    };
  },
};

function resolveIntervalMs(config: Record<string, unknown>): number {
  const intervalSeconds = config.intervalSeconds;
  if (
    typeof intervalSeconds === "number" &&
    Number.isFinite(intervalSeconds) &&
    intervalSeconds > 0
  ) {
    return Math.max(1, Math.round(intervalSeconds * 1_000));
  }

  const intervalMs = config.intervalMs;
  if (typeof intervalMs === "number" && Number.isFinite(intervalMs) && intervalMs > 0) {
    return Math.max(1, Math.round(intervalMs));
  }

  return DEFAULT_RECURRING_WORKER_INTERVAL_MS;
}

function readTodu(value: unknown): Todu | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeTodu = value as Todu;
  if (!maybeTodu.recurring || typeof maybeTodu.recurring.process !== "function") {
    return null;
  }

  return maybeTodu;
}

function describeResultError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const errorRecord = error as Record<string, unknown>;
  const type = typeof errorRecord.type === "string" ? errorRecord.type : "unknown";
  const message = typeof errorRecord.message === "string" ? errorRecord.message : null;

  if (message) {
    return `${type}: ${message}`;
  }

  if (
    type === "not-found" &&
    typeof errorRecord.entity === "string" &&
    typeof errorRecord.id === "string"
  ) {
    return `${errorRecord.entity} not found: ${errorRecord.id}`;
  }

  return type;
}
