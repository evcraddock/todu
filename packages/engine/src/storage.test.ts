import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentId } from "@automerge/automerge-repo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginCatalogJoinSwitch, initBootstrapStorage, initJoinStorage } from "./storage.js";

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
    const unreachable = "2sFuwGcFcU9fkQDnYCdveNPoF6nK";
    fs.writeFileSync(markerPath, unreachable, "utf-8");

    await expect(initBootstrapStorage(tmpDir)).rejects.toThrow("bootstrap catalog");

    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(unreachable);
  });

  it("join path never creates a fresh catalog when target is unreachable", async () => {
    const target = "2sFuwGcFcU9fkQDnYCdveNPoF6nK" as DocumentId;

    await expect(initJoinStorage(tmpDir, target)).rejects.toThrow("join catalog");

    const markerPath = path.join(tmpDir, "todu-catalog.id");
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it("join switch rollback restores prior marker", () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const previous = "2Y2aJ8G8MSYn6wVqVEf4GQ9B5m5H" as DocumentId;
    const target = "2sFuwGcFcU9fkQDnYCdveNPoF6nK" as DocumentId;

    fs.writeFileSync(markerPath, previous, "utf-8");

    const tx = beginCatalogJoinSwitch(tmpDir, target);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(target);

    tx.rollback();
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(previous);
  });

  it("join switch rollback removes marker when no prior catalog existed", () => {
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const target = "2sFuwGcFcU9fkQDnYCdveNPoF6nK" as DocumentId;

    const tx = beginCatalogJoinSwitch(tmpDir, target);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(target);

    tx.rollback();
    expect(fs.existsSync(markerPath)).toBe(false);
  });
});
