export const DAEMON_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type DaemonLogLevel = (typeof DAEMON_LOG_LEVELS)[number];

export interface DaemonLogger {
  readonly level: DaemonLogLevel;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(component: string): DaemonLogger;
}

export interface CreateDaemonLoggerOptions {
  level?: DaemonLogLevel;
  component?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  writeStdout?: (line: string) => void;
  writeStderr?: (line: string) => void;
}

interface DaemonLogEntry {
  ts: string;
  level: DaemonLogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
}

const DEFAULT_DAEMON_LOG_LEVEL: DaemonLogLevel = "info";

export function createDaemonLogger(options: CreateDaemonLoggerOptions = {}): DaemonLogger {
  const level =
    options.level ??
    resolveDaemonLogLevelFromEnv(options.env ?? process.env, DEFAULT_DAEMON_LOG_LEVEL);
  const component = normalizeComponent(options.component);
  const now = options.now ?? (() => new Date().toISOString());
  const writeStdout = options.writeStdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeStderr = options.writeStderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  const threshold = levelSeverity(level);

  const log = (
    entryLevel: DaemonLogLevel,
    message: string,
    context: Record<string, unknown> | undefined,
  ) => {
    if (levelSeverity(entryLevel) < threshold) {
      return;
    }

    const entry: DaemonLogEntry = {
      ts: now(),
      level: entryLevel,
      component,
      message,
    };

    const normalizedContext = normalizeContext(context);
    if (normalizedContext && Object.keys(normalizedContext).length > 0) {
      entry.context = normalizedContext;
    }

    const serialized = JSON.stringify(entry);
    if (entryLevel === "warn" || entryLevel === "error") {
      writeStderr(serialized);
      return;
    }

    writeStdout(serialized);
  };

  return {
    level,
    debug: (message, context) => {
      log("debug", message, context);
    },
    info: (message, context) => {
      log("info", message, context);
    },
    warn: (message, context) => {
      log("warn", message, context);
    },
    error: (message, context) => {
      log("error", message, context);
    },
    child: (childComponent) =>
      createDaemonLogger({
        level,
        component: `${component}.${normalizeComponent(childComponent)}`,
        now,
        writeStdout,
        writeStderr,
      }),
  };
}

export function resolveDaemonLogLevelFromEnv(
  env: NodeJS.ProcessEnv,
  fallback: DaemonLogLevel = DEFAULT_DAEMON_LOG_LEVEL,
): DaemonLogLevel {
  return resolveDaemonLogLevel(env.TODUAI_LOG_LEVEL, fallback);
}

export function resolveDaemonLogLevel(
  value: string | undefined,
  fallback: DaemonLogLevel = DEFAULT_DAEMON_LOG_LEVEL,
): DaemonLogLevel {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "warning") {
    return "warn";
  }

  if (isDaemonLogLevel(normalized)) {
    return normalized;
  }

  return fallback;
}

export function isDaemonLogLevel(value: string): value is DaemonLogLevel {
  return (DAEMON_LOG_LEVELS as readonly string[]).includes(value);
}

function levelSeverity(level: DaemonLogLevel): number {
  switch (level) {
    case "debug":
      return 10;
    case "info":
      return 20;
    case "warn":
      return 30;
    case "error":
      return 40;
  }
}

function normalizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const entries: Array<[string, unknown]> = [];

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) {
      continue;
    }

    entries.push([key, normalizeContextValue(value)]);
  }

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function normalizeContextValue(value: unknown): unknown {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "object") {
    return value;
  }

  try {
    return JSON.parse(
      JSON.stringify(value, (_key, nestedValue: unknown) => {
        if (nestedValue instanceof Error) {
          return nestedValue.message;
        }

        if (typeof nestedValue === "bigint") {
          return nestedValue.toString();
        }

        if (typeof nestedValue === "function") {
          return "[function]";
        }

        return nestedValue;
      }),
    ) as unknown;
  } catch {
    return String(value);
  }
}

function normalizeComponent(component: string | undefined): string {
  if (!component || component.trim().length === 0) {
    return "daemon";
  }

  return component.trim();
}
