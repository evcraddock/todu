import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createIntegrationBindingId, createTaskId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSyncContentRecoveryStore,
  type SyncContentRecovery,
} from "./sync-content-recovery.js";

const bindingId = createIntegrationBindingId("binding-1");
const row: SyncContentRecovery = {
  localTaskId: createTaskId("task-1"),
  externalId: "remote-1",
  localTimestamp: "2026-04-03T00:00:00Z",
  before: { title: "Before", description: "Body" },
  after: { title: "After", description: "New body" },
  sourceTimestamp: "2026-04-01T00:00:00Z",
};

describe("host-local content recovery", () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-content-recovery-"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("persists across store restart, scopes by catalog/binding, and clears only acknowledged work", async () => {
    const store = createSyncContentRecoveryStore({
      storagePath: directory,
      catalogId: "catalog-1",
    });
    expect(await store.read(bindingId)).toEqual({ ok: true, value: [] });
    expect((await store.write(bindingId, [row])).ok).toBe(true);
    const restarted = createSyncContentRecoveryStore({
      storagePath: directory,
      catalogId: "catalog-1",
    });
    expect(await restarted.read(bindingId)).toEqual({ ok: true, value: [row] });
    expect(await restarted.read(createIntegrationBindingId("binding-2"))).toEqual({
      ok: true,
      value: [],
    });
    expect(
      await createSyncContentRecoveryStore({ storagePath: directory, catalogId: "catalog-2" }).read(
        bindingId,
      ),
    ).toEqual({ ok: true, value: [] });
    if (process.platform !== "win32") {
      const file = fs.readdirSync(path.join(directory, "sync-content-recovery"))[0];
      expect(fs.statSync(path.join(directory, "sync-content-recovery", file)).mode & 0o777).toBe(
        0o600,
      );
    }
    expect((await restarted.write(bindingId, [])).ok).toBe(true);
    expect(await restarted.read(bindingId)).toEqual({ ok: true, value: [] });
  });

  it("keeps the previous recovery record on failed atomic replacement", async () => {
    const store = createSyncContentRecoveryStore({
      storagePath: directory,
      catalogId: "catalog-1",
    });
    await store.write(bindingId, [row]);
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });
    expect(
      await store.write(bindingId, [{ ...row, after: { title: "Other", description: "" } }]),
    ).toMatchObject({ ok: false, error: { type: "storage" } });
    expect(await store.read(bindingId)).toEqual({ ok: true, value: [row] });
    expect(fs.readdirSync(path.join(directory, "sync-content-recovery"))).toHaveLength(1);
  });

  it("reports corrupt or malformed state without treating it as an empty snapshot", async () => {
    const store = createSyncContentRecoveryStore({
      storagePath: directory,
      catalogId: "catalog-1",
    });
    await store.write(bindingId, [row]);
    const file = path.join(
      directory,
      "sync-content-recovery",
      fs.readdirSync(path.join(directory, "sync-content-recovery"))[0],
    );
    for (const text of [
      "not json",
      JSON.stringify([{ ...row, localTimestamp: "invalid" }]),
      JSON.stringify([{ ...row, after: { title: "Title" } }]),
    ]) {
      fs.writeFileSync(file, text);
      expect(await store.read(bindingId)).toMatchObject({ ok: false, error: { type: "storage" } });
    }
  });
});
