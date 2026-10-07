import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Repo } from "@automerge/automerge-repo/slim";
import { isValidDocumentId } from "@automerge/automerge-repo/slim";
import {
  type CatalogDocument,
  createDeviceId,
  type DeviceId,
  deviceRegistryKey,
  type EnrollmentApproval,
  type EnrollmentClientStatus,
  err,
  ok,
  type Result,
  SCHEMA_VERSION,
  storageError,
  validationError,
} from "@todu/core";
import { ensureAutomergeWasmInitialized } from "./automerge-init.js";
import { createPersistentRepo, shutdownPersistentRepo } from "./storage.js";

export const ENROLLMENT_STATE_FILENAME = "todu-enrollment.json";
export interface LocalEnrollmentState {
  version: 1;
  mode: "pending" | "active";
  status: EnrollmentClientStatus;
  approval?: EnrollmentApproval;
  connection?: { endpoint: string; approval: EnrollmentApproval };
}

export function atomicWriteEnrollmentJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function readEnrollmentState(storagePath: string): LocalEnrollmentState | null {
  const file = path.join(storagePath, ENROLLMENT_STATE_FILENAME);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const state = JSON.parse(text) as LocalEnrollmentState;
  if (
    state?.version !== 1 ||
    !["pending", "active"].includes(state.mode) ||
    !state.status ||
    ![
      "prepared",
      "pending",
      "attaching",
      "active",
      "denied",
      "expired",
      "error",
      "cancelled",
    ].includes(state.status.stage)
  ) {
    throw new Error(
      `Invalid pending enrollment state in ${file}; refusing implicit catalog creation`,
    );
  }
  return state;
}
export function writeEnrollmentState(storagePath: string, state: LocalEnrollmentState): void {
  atomicWriteEnrollmentJson(path.join(storagePath, ENROLLMENT_STATE_FILENAME), state);
}
export function readEnrollmentCatalogId(storagePath: string): string | null {
  try {
    const id = fs.readFileSync(path.join(storagePath, "todu-catalog.id"), "utf-8").trim();
    if (!isValidDocumentId(id))
      throw new Error("Existing catalog marker is invalid; enrollment cannot replace it");
    return id;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function hasDocumentData(directory: string): boolean {
  if (!fs.existsSync(directory)) return false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error("Enrollment preparation refuses symbolic links in storage");
    if (
      entry.isDirectory() &&
      (entry.name === "snapshot" ||
        entry.name === "incremental" ||
        hasDocumentData(path.join(directory, entry.name)))
    )
      return true;
  }
  return false;
}

/** Declare pristine pending setup without constructing a Repo or a throwaway catalog. */
export function prepareEnrollmentStorage(options: {
  storagePath: string;
  socketPath?: string;
}): Result<EnrollmentClientStatus> {
  try {
    const { storagePath } = options;
    if (readEnrollmentCatalogId(storagePath))
      return err(
        validationError(
          "storagePath",
          "This installation already has a dataset; enroll its running daemon without pristine preparation",
        ),
      );
    const previous = readEnrollmentState(storagePath);
    if (previous?.mode === "pending") return ok(previous.status);
    if (previous || hasDocumentData(storagePath))
      return err(
        validationError(
          "storagePath",
          "Stored dataset data exists without a catalog marker; refusing to treat it as pristine",
        ),
      );
    if (fs.existsSync(options.socketPath ?? path.join(storagePath, "daemon.sock")))
      return err(
        validationError(
          "storagePath",
          "Stop the existing daemon before preparing pristine enrollment",
        ),
      );
    const state: LocalEnrollmentState = {
      version: 1,
      mode: "pending",
      status: { stage: "prepared" },
    };
    fs.mkdirSync(storagePath, { recursive: true });
    // Exclusive creation prevents another preparation from overwriting pending identity/state.
    fs.writeFileSync(path.join(storagePath, ENROLLMENT_STATE_FILENAME), JSON.stringify(state), {
      flag: "wx",
      mode: 0o600,
    });
    return ok(state.status);
  } catch (error) {
    return err(storageError(`Cannot prepare enrollment: ${String(error)}`));
  }
}

export interface PendingEnrollmentStorage {
  repo: Repo;
  deviceId: DeviceId;
  close(): Promise<void>;
}
export async function openPendingEnrollmentStorage(
  storagePath: string,
): Promise<PendingEnrollmentStorage> {
  const state = readEnrollmentState(storagePath);
  if (state?.mode !== "pending") throw new Error("Explicit pristine pending setup is required");
  const marker = readEnrollmentCatalogId(storagePath);
  if (marker && marker !== state.approval?.catalogId)
    throw new Error("Pending enrollment cannot replace an initialized dataset");
  await ensureAutomergeWasmInitialized();
  const repo = createPersistentRepo(storagePath);
  try {
    const id = await repo.storageId();
    if (!id) throw new Error("Pending Repo has no native persistent identity");
    const deviceId = createDeviceId(id);
    if (state.status.deviceId && state.status.deviceId !== deviceId)
      throw new Error("Pending replica identity changed; refusing enrollment retry");
    writeEnrollmentState(storagePath, { ...state, status: { ...state.status, deviceId } });
    return { repo, deviceId, close: () => shutdownPersistentRepo(repo) };
  } catch (error) {
    await shutdownPersistentRepo(repo);
    throw error;
  }
}

export function validateEnrolledCatalog(
  doc: CatalogDocument | undefined,
  approval: EnrollmentApproval,
): Result<void> {
  if (
    !doc ||
    !Number.isInteger(doc.version) ||
    doc.version < 1 ||
    doc.version > SCHEMA_VERSION ||
    !Array.isArray(doc.projects) ||
    !Array.isArray(doc.labels) ||
    !Array.isArray(doc.habits) ||
    !doc.taskListDocIds ||
    !doc.settings
  ) {
    return err(
      validationError("catalogId", "Approved source did not supply a supported Todu catalog"),
    );
  }
  const member = doc[deviceRegistryKey(approval.deviceId)];
  if (!member || member.removed || member.id !== approval.deviceId)
    return err(
      validationError("deviceId", "Approved membership is not present in the received catalog yet"),
    );
  return ok(undefined);
}

/** Publish the approved catalog only after loading, validating, and flushing it locally. */
export function commitEnrollmentCatalog(storagePath: string, state: LocalEnrollmentState): void {
  if (!state.approval || !isValidDocumentId(state.approval.catalogId))
    throw new Error("Validated catalog approval is required before activation");
  const marker = path.join(storagePath, "todu-catalog.id");
  const existing = readEnrollmentCatalogId(storagePath);
  if (existing && existing !== state.approval.catalogId)
    throw new Error("Another dataset was initialized; refusing enrollment activation");
  if (!existing) {
    const temporary = `${marker}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, state.approval.catalogId, { flag: "wx", mode: 0o600 });
      fs.linkSync(temporary, marker);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  writeEnrollmentState(storagePath, {
    ...state,
    mode: "active",
    connection: state.status.endpoint
      ? { endpoint: state.status.endpoint, approval: state.approval }
      : state.connection,
    status: {
      ...state.status,
      stage: "active",
      catalogId: state.approval.catalogId,
      error: undefined,
    },
  });
}
