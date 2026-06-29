import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeFSStorageAdapter } from "./nodefs-storage-adapter.js";

describe("NodeFSStorageAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-nodefs-storage-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("saves, loads, lists, and removes key ranges", async () => {
    const adapter = new NodeFSStorageAdapter(tempDir);
    const key = ["document-a", "snapshot"];

    await adapter.save(key, new Uint8Array([1, 2, 3]));

    await expect(adapter.load(key)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(adapter.loadRange(["document-a"])).resolves.toEqual([
      { key, data: new Uint8Array([1, 2, 3]) },
    ]);

    await adapter.removeRange(["document-a"]);

    await expect(adapter.load(key)).resolves.toBeUndefined();
    await expect(adapter.loadRange(["document-a"])).resolves.toEqual([]);
  });
});
