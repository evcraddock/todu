import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  err,
  type IntegrationBindingId,
  ok,
  type Result,
  type SyncTaskFieldGroupValues,
  storageError,
  type TaskId,
  validateISODate,
  validateSyncTaskFieldGroupUpdate,
} from "@todu/core";

export interface SyncContentRecovery {
  localTaskId: TaskId;
  externalId: string;
  before: SyncTaskFieldGroupValues["content"];
  after: SyncTaskFieldGroupValues["content"];
  /** Application preserves this clock; a different clock means an intervening edit. */
  localTimestamp: string;
  sourceTimestamp?: string;
}

export interface SyncContentRecoveryStore {
  read(bindingId: IntegrationBindingId): Promise<Result<SyncContentRecovery[]>>;
  write(bindingId: IntegrationBindingId, records: SyncContentRecovery[]): Promise<Result<void>>;
}

/** Host-local interrupted content applications, never provider checkpoints or mirrored bases. */
export function createSyncContentRecoveryStore(options: {
  storagePath: string;
  catalogId: string;
  ephemeral?: boolean;
}): SyncContentRecoveryStore {
  const memory = new Map<string, SyncContentRecovery[]>();
  const fileFor = (bindingId: IntegrationBindingId): string =>
    path.join(
      options.storagePath,
      "sync-content-recovery",
      `${crypto
        .createHash("sha256")
        .update(JSON.stringify([options.catalogId, bindingId]))
        .digest("hex")}.json`,
    );
  return {
    async read(bindingId) {
      try {
        if (options.ephemeral) return ok(structuredClone(memory.get(bindingId) ?? []));
        const file = fileFor(bindingId);
        if (fs.statSync(file).size > 16 * 1024 * 1024)
          throw new Error("Content recovery file exceeds 16 MiB");
        const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!Array.isArray(parsed) || parsed.some((row: unknown) => !isRecovery(row)))
          throw new Error("Invalid content recovery records");
        return ok(parsed as SyncContentRecovery[]);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok([]);
        return err(
          storageError(`Content recovery read failed: binding=${bindingId} error=${String(error)}`),
        );
      }
    },
    async write(bindingId, records) {
      try {
        if (options.ephemeral) {
          memory.set(bindingId, structuredClone(records));
          return ok(undefined);
        }
        const file = fileFor(bindingId);
        if (records.length === 0) {
          try {
            fs.unlinkSync(file);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          return ok(undefined);
        }
        const text = JSON.stringify(records);
        if (
          Buffer.byteLength(text) > 16 * 1024 * 1024 ||
          records.some((record) => !isRecovery(record))
        )
          throw new Error("Invalid or oversized content recovery records");
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        try {
          fs.writeFileSync(temporary, text, { flag: "wx", mode: 0o600 });
          fs.renameSync(temporary, file);
        } finally {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
        return ok(undefined);
      } catch (error) {
        return err(
          storageError(
            `Content recovery write failed: binding=${bindingId} error=${String(error)}`,
          ),
        );
      }
    },
  };
}

function isRecovery(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.localTaskId === "string" &&
    row.localTaskId.trim().length > 0 &&
    typeof row.localTimestamp === "string" &&
    !validateISODate("localTimestamp", row.localTimestamp) &&
    validateSyncTaskFieldGroupUpdate({
      externalId: row.externalId,
      groups: {
        content: {
          base: row.before,
          remote: row.after,
          ...(Object.hasOwn(row, "sourceTimestamp")
            ? { sourceTimestamp: row.sourceTimestamp }
            : {}),
        },
      },
    }).ok
  );
}
