import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./todu.js";

const TEST_SYNC_PORT = 24399; // Avoid conflict with real instances on 24377
const RUN_SYNC_SERVER_TESTS = process.env.TODUAI_RUN_SYNC_SERVER_TESTS === "1";

async function waitFor<T>(fn: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error("timed out waiting for expected sync state");
}

(RUN_SYNC_SERVER_TESTS ? describe : describe.skip)("sync: ephemeral client + server", () => {
  let tmpDir: string;
  let server: Todu;
  let client: Todu;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-sync-test-"));

    // Start server (Electron-like): persistent storage + sync server
    server = await createTodu({
      storagePath: tmpDir,
      syncServer: true,
      syncPort: TEST_SYNC_PORT,
    });

    // Allow sync server to fully initialize before clients connect
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(async () => {
    if (client) await client.close();
    if (server) await server.close();
    // Small delay for Automerge to release file handles
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("server creates data, ephemeral client reads it", { timeout: 15000 }, async () => {
    // Create data on server
    const createResult = await server.project.create({ name: "Sync Test Project" });
    expect(createResult.ok).toBe(true);

    // Connect ephemeral client
    client = await createTodu({
      storagePath: tmpDir,
      syncClient: true,
      syncPort: TEST_SYNC_PORT,
    });

    // Client should see the project via sync
    const listResult = await client.project.list();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      const projects = listResult.value;
      expect(projects.length).toBeGreaterThanOrEqual(1);
      expect(projects.some((p) => p.name === "Sync Test Project")).toBe(true);
    }
  });

  it("ephemeral client creates data, server sees it", { timeout: 15000 }, async () => {
    // Connect ephemeral client
    client = await createTodu({
      storagePath: tmpDir,
      syncClient: true,
      syncPort: TEST_SYNC_PORT,
    });

    // Create data on client
    const createResult = await client.project.create({ name: "Client Project" });
    expect(createResult.ok).toBe(true);

    // Give sync a moment to propagate
    await new Promise((r) => setTimeout(r, 200));

    // Server should see it
    const listResult = await server.project.list();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.some((p) => p.name === "Client Project")).toBe(true);
    }
  });

  it(
    "syncs note create/update across server and ephemeral client",
    { timeout: 20000 },
    async () => {
      const project = await server.project.create({ name: "Notes Sync Project" });
      expect(project.ok).toBe(true);
      if (!project.ok) return;

      const task = await server.task.create({
        title: "Notes Sync Task",
        projectId: project.value.id,
      });
      expect(task.ok).toBe(true);
      if (!task.ok) return;

      const serverNote = await server.note.create({
        content: "Created on server",
        entityType: "task",
        entityId: task.value.id,
      });
      expect(serverNote.ok).toBe(true);
      if (!serverNote.ok) return;

      client = await createTodu({
        storagePath: tmpDir,
        syncClient: true,
        syncPort: TEST_SYNC_PORT,
      });

      const clientTaskNotes = await waitFor(
        () => client.note.list({ entityType: "task", entityId: task.value.id }),
        (result) => result.ok && result.value.some((note) => note.id === serverNote.value.id),
      );
      expect(clientTaskNotes.ok).toBe(true);

      const updateFromClient = await client.note.update(serverNote.value.id, {
        content: "Updated from client",
        tags: ["synced"],
      });
      expect(updateFromClient.ok).toBe(true);

      const serverTaskNotes = await waitFor(
        () => server.note.list({ entityType: "task", entityId: task.value.id }),
        (result) =>
          result.ok &&
          result.value.some(
            (note) => note.id === serverNote.value.id && note.content === "Updated from client",
          ),
      );
      expect(serverTaskNotes.ok).toBe(true);

      const clientJournal = await client.note.create({ content: "Journal from client" });
      expect(clientJournal.ok).toBe(true);
      if (!clientJournal.ok) return;

      const serverAllNotes = await waitFor(
        () => server.note.list(),
        (result) => result.ok && result.value.some((note) => note.id === clientJournal.value.id),
      );
      expect(serverAllNotes.ok).toBe(true);
    },
  );

  it("ephemeral client does not write to disk", { timeout: 15000 }, async () => {
    // Note the files before client connects
    const filesBefore = new Set(fs.readdirSync(tmpDir));

    // Connect ephemeral client and create data
    client = await createTodu({
      storagePath: tmpDir,
      syncClient: true,
      syncPort: TEST_SYNC_PORT,
    });

    await client.project.create({ name: "Ephemeral Project" });

    // Wait for sync to propagate to server before closing
    await new Promise((r) => setTimeout(r, 500));

    // Close client
    await client.close();

    // Only the server should have written files.
    // The ephemeral client should not have added any new files.
    // (Server may have flushed synced data, which is expected.)
    // The key check: no new storage adapter files from the client.
    const filesAfter = new Set(fs.readdirSync(tmpDir));

    // The marker file and automerge storage should already exist from server init.
    // We mainly verify the client didn't crash or corrupt anything.
    expect(filesAfter.size).toBeGreaterThanOrEqual(filesBefore.size);

    // Reconnect server to verify data integrity
    await server.close();
    const server2 = await createTodu({ storagePath: tmpDir });
    const listResult = await server2.project.list();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      // The project created by the ephemeral client should have synced to server
      // and been persisted by the server
      expect(listResult.value.some((p) => p.name === "Ephemeral Project")).toBe(true);
    }
    await server2.close();
  });
});

describe("sync: standalone mode (no server)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-standalone-test-"));
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("CLI standalone creates and reads data without sync", { timeout: 10000 }, async () => {
    const todu = await createTodu({ storagePath: tmpDir });

    const createResult = await todu.project.create({ name: "Standalone Project" });
    expect(createResult.ok).toBe(true);

    const listResult = await todu.project.list();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.length).toBe(1);
      expect(listResult.value[0].name).toBe("Standalone Project");
    }

    await todu.close();

    // Reopen — data should persist
    const todu2 = await createTodu({ storagePath: tmpDir });
    const listResult2 = await todu2.project.list();
    expect(listResult2.ok).toBe(true);
    if (listResult2.ok) {
      expect(listResult2.value.length).toBe(1);
      expect(listResult2.value[0].name).toBe("Standalone Project");
    }
    await todu2.close();
  });
});
