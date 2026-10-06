import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_BYTES = 1024 * 1024;
const ARCHIVES = 2;
const CONTEXT_KEYS = [
  "socketPath",
  "desktopVersion",
  "daemonVersion",
  "clientProtocol",
  "attempt",
  "delayMs",
] as const;

export interface DesktopErrorContext {
  socketPath?: string;
  desktopVersion?: string;
  daemonVersion?: string;
  clientProtocol?: string;
  attempt?: number;
  delayMs?: number;
}

export interface DesktopErrorLog {
  readonly path: string;
  readonly available: boolean;
  write(phase: string, error: unknown, context?: DesktopErrorContext): void;
}

export function createDesktopErrorLog(options: {
  directory: string;
  maxBytes?: number;
  fallback?: (line: string) => void;
}): DesktopErrorLog {
  const logPath = path.join(options.directory, "desktop-error.log");
  const maxBytes = Math.max(1024, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const fallback = options.fallback ?? ((line: string) => console.error(line));
  let available = false;

  function reportWriteFailure(line: string, error: unknown): void {
    available = false;
    try {
      // Never dump the filesystem exception or arbitrary context/config to stderr.
      fallback(
        `Desktop error log unavailable (${readCode(error) ?? "WRITE_FAILED"}): ${logPath}\n${line}`,
      );
    } catch {
      // A failed fallback must not replace the original application error.
    }
  }

  function prepareFile(): void {
    fs.mkdirSync(options.directory, { recursive: true, mode: 0o700 });
    const fd = fs.openSync(
      logPath,
      fs.constants.O_CREAT |
        fs.constants.O_APPEND |
        fs.constants.O_WRONLY |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    try {
      fs.fchmodSync(fd, 0o600);
    } finally {
      fs.closeSync(fd);
    }
  }

  try {
    prepareFile();
    available = true;
  } catch (error) {
    reportWriteFailure("", error);
  }

  return {
    path: logPath,
    get available(): boolean {
      return available;
    },
    write(phase, error, context = {}): void {
      try {
        const safeContext = Object.fromEntries(
          CONTEXT_KEYS.flatMap<[string, string | number]>((key) => {
            const value = context[key];
            if (typeof value === "string") return [[key, redact(value)]];
            if (typeof value === "number" && Number.isFinite(value)) return [[key, value]];
            return [];
          }),
        );
        const entry = {
          ts: new Date().toISOString(),
          level: "error",
          component: "desktop",
          phase: redact(phase),
          error: summarizeError(error),
          context: safeContext,
        };
        let line = `${JSON.stringify(entry)}\n`;
        if (Buffer.byteLength(line) > maxBytes) {
          line = `${JSON.stringify({
            ts: entry.ts,
            level: entry.level,
            component: entry.component,
            phase: entry.phase.slice(0, 32),
            error: {
              code: entry.error.code,
              message: "Error record exceeded log size limit; details omitted",
            },
          })}\n`;
        }
        prepareFile();
        if (fs.statSync(logPath).size + Buffer.byteLength(line) > maxBytes) {
          rotate(logPath);
        }
        // Synchronous writes survive immediate startup failure/process exit.
        const fd = fs.openSync(
          logPath,
          fs.constants.O_CREAT |
            fs.constants.O_APPEND |
            fs.constants.O_WRONLY |
            fs.constants.O_NOFOLLOW,
          0o600,
        );
        try {
          fs.writeSync(fd, line);
        } finally {
          fs.closeSync(fd);
        }
        available = true;
      } catch (writeError) {
        reportWriteFailure(
          JSON.stringify({ phase: redact(phase), error: summarizeError(error) }),
          writeError,
        );
      }
    },
  };
}

function rotate(logPath: string): void {
  for (let index = ARCHIVES; index >= 1; index -= 1) {
    const target = `${logPath}.${index}`;
    fs.rmSync(target, { force: true });
    const source = index === 1 ? logPath : `${logPath}.${index - 1}`;
    if (fs.existsSync(source)) fs.renameSync(source, target);
  }
}

interface ErrorSummary {
  code?: string;
  message: string;
  reason?: string;
  cause?: ErrorSummary;
}

function summarizeError(error: unknown, depth = 0): ErrorSummary {
  try {
    return readErrorSummary(error, depth);
  } catch {
    return { message: "Error details could not be read" };
  }
}

function readErrorSummary(error: unknown, depth: number): ErrorSummary {
  if (typeof error === "string") return { message: redact(error) };
  if (!error || typeof error !== "object") return { message: "Unknown desktop error" };
  const source = error as {
    message?: unknown;
    code?: unknown;
    cause?: unknown;
    details?: { reason?: unknown };
  };
  return {
    code: readCode(source),
    message: typeof source.message === "string" ? redact(source.message) : "Unknown desktop error",
    reason: typeof source.details?.reason === "string" ? redact(source.details.reason) : undefined,
    cause:
      source.cause !== undefined && depth < 3 ? summarizeError(source.cause, depth + 1) : undefined,
  };
}

function readCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? redact(error.code).slice(0, 80) : undefined;
}

function redact(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      "[REDACTED KEY]",
    )
    .replace(/\b(?:Bearer|Basic)\s+[^\s"',;]+/gi, "[REDACTED AUTH]")
    .replace(
      /((?:token|password|secret|api[_-]?key|authorization)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/(\w+:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@")
    .slice(0, 2048);
}

export function formatDesktopStartupError(error: unknown, log: DesktopErrorLog): string {
  const message = summarizeError(error).message;
  const status = log.available
    ? "Error log"
    : "Error log could not be written; check directory permissions";
  return `${redact(message)}\n\n${status}: ${log.path}`;
}
