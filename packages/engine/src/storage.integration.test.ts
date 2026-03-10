import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentId } from "@automerge/automerge-repo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginCatalogJoinSwitch, initBootstrapStorage, initJoinStorage } from "./storage.js";

const UNREACHABLE_CATALOG_ID = "2sFuwGcFcU9fkQDnYCdveNPoF6nK" as DocumentId;

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("storage bootstrap/join boundaries", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-storage-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("bootstrap creates initial catalog when marker is missing", async () => {
    const storage = await initBootstrapStorage(tmpDir);

    const markerPath = path.join(tmpDir, "todu-catalog.id");
    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = fs.readFileSync(markerPath, "utf-8").trim();
    expect(marker).toBe(storage.catalog.documentId);

    await storage.close();
  });

  it("bootstrap does not create replacement catalog when marker is unreachable", async () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    fs.writeFileSync(markerPath, UNREACHABLE_CATALOG_ID, "utf-8");

    await expect(initBootstrapStorage(tmpDir)).rejects.toThrow("bootstrap catalog");

    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(UNREACHABLE_CATALOG_ID);
  });

  it("join path never creates a fresh catalog when target is unreachable", async () => {
    await expect(initJoinStorage(tmpDir, UNREACHABLE_CATALOG_ID)).rejects.toThrow("join catalog");

    const markerPath = path.join(tmpDir, "todu-catalog.id");
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it("failed bootstrap init cleans up owned repo without async storage leaks", async () => {
    for (let i = 0; i < 20; i += 1) {
      const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-storage-bootstrap-fail-"));
      const markerPath = path.join(runDir, "todu-catalog.id");
      fs.writeFileSync(markerPath, UNREACHABLE_CATALOG_ID, "utf-8");

      await expect(initBootstrapStorage(runDir)).rejects.toThrow("bootstrap catalog");

      fs.rmSync(runDir, { recursive: true, force: true });
      await nextTick();
    }
  });

  it("failed join init cleans up owned repo without async storage leaks", async () => {
    for (let i = 0; i < 20; i += 1) {
      const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-storage-join-fail-"));

      await expect(initJoinStorage(runDir, UNREACHABLE_CATALOG_ID)).rejects.toThrow("join catalog");

      fs.rmSync(runDir, { recursive: true, force: true });
      await nextTick();
    }
  });

  it("join switch rollback restores prior marker", () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const previous = "2Y2aJ8G8MSYn6wVqVEf4GQ9B5m5H" as DocumentId;
    const target = UNREACHABLE_CATALOG_ID;

    fs.writeFileSync(markerPath, previous, "utf-8");

    const tx = beginCatalogJoinSwitch(tmpDir, target);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(target);

    tx.rollback();
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(previous);
  });

  it("join switch rollback removes marker when no prior catalog existed", () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const target = UNREACHABLE_CATALOG_ID;

    const tx = beginCatalogJoinSwitch(tmpDir, target);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(target);

    tx.rollback();
    expect(fs.existsSync(markerPath)).toBe(false);
  });
});
