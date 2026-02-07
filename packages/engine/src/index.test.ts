import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "@automerge/automerge-repo";
import type { DocumentId } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import type { CatalogDocument } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./index.js";

describe("createTodu", () => {
  let tmpDir: string;
  let todu: Todu | null = null;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-test-"));
  });

  afterEach(async () => {
    if (todu) {
      await todu.close();
      await new Promise((r) => setTimeout(r, 50));
      todu = null;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates an instance with all namespaces", async () => {
    todu = await createTodu({ storagePath: tmpDir });

    expect(todu.project).toBeDefined();
    expect(todu.task).toBeDefined();
    expect(todu.label).toBeDefined();
    expect(todu.note).toBeDefined();
    expect(todu.recurring).toBeDefined();
    expect(todu.habit).toBeDefined();
    expect(todu.sync).toBeDefined();
    expect(todu.config).toBeDefined();
    expect(todu.close).toBeDefined();
  });

  it("creates data directory if it does not exist", async () => {
    const nestedDir = path.join(tmpDir, "nested", "data");
    todu = await createTodu({ storagePath: nestedDir });

    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it("creates catalog document on first run", async () => {
    todu = await createTodu({ storagePath: tmpDir });

    // Catalog marker file should exist
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    expect(fs.existsSync(markerPath)).toBe(true);

    const docId = fs.readFileSync(markerPath, "utf-8").trim();
    expect(docId.length).toBeGreaterThan(0);
  });

  it("loads existing catalog on subsequent runs", async () => {
    // First run — creates catalog
    todu = await createTodu({ storagePath: tmpDir });
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const firstDocId = fs.readFileSync(markerPath, "utf-8").trim();
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));

    // Second run — loads same catalog
    todu = await createTodu({ storagePath: tmpDir });
    const secondDocId = fs.readFileSync(markerPath, "utf-8").trim();

    expect(secondDocId).toBe(firstDocId);
  });

  it("returns config via config.get()", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    const config = todu.config.get();
    expect(config.storagePath).toBe(tmpDir);
  });

  it("reports sync as disconnected by default", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    const status = todu.sync.status();
    expect(status.connected).toBe(false);
  });

  it("closes without error", async () => {
    todu = await createTodu({ storagePath: tmpDir });
    await expect(todu.close()).resolves.toBeUndefined();
    todu = null; // prevent double-close in afterEach
  });

  it("migrates old catalog missing fields", async () => {
    // Simulate an old catalog with only projects and version
    const repo = new Repo({
      storage: new NodeFSStorageAdapter(tmpDir),
    });
    const handle = repo.create<Partial<CatalogDocument>>();
    handle.change((doc) => {
      doc.version = 1;
      doc.projects = [];
      // Deliberately missing: labels, taskListDocIds, settings
    });
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    fs.writeFileSync(markerPath, handle.documentId, "utf-8");
    await repo.flush();
    await repo.shutdown();
    await new Promise((r) => setTimeout(r, 50));

    // Load with createTodu — should migrate without crashing
    todu = await createTodu({ storagePath: tmpDir });

    // All operations should work on migrated catalog
    const projects = await todu.project.list();
    expect(projects.ok).toBe(true);

    const tasks = await todu.task.list();
    expect(tasks.ok).toBe(true);

    const labels = await todu.label.list();
    expect(labels.ok).toBe(true);

    const notes = await todu.note.list();
    expect(notes.ok).toBe(true);
  });
});
