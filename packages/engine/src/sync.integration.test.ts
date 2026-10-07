import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startTestSyncServer } from "../../../scripts/test-helpers/sync-server.js";
import { createTodu } from "./index.js";
import type { Todu } from "./todu.js";

async function waitFor<T>(fn: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for note replication");
}

describe("SDK sync server and ephemeral client", () => {
  let directory: string | undefined;
  let server: Todu | undefined;
  let client: Todu | undefined;

  afterEach(async () => {
    try {
      await client?.close();
    } finally {
      await server?.close();
    }
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    directory = undefined;
    server = undefined;
    client = undefined;
  });

  it(
    "replicates note buckets bidirectionally and persists received edits across restart",
    { timeout: 20_000 },
    async () => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-sync-test-"));
      const started = await startTestSyncServer(directory);
      server = started.server;
      expect(server.sync.status()).toMatchObject({
        local: { mode: "sync-server" },
        remote: { state: "disconnected" },
      });

      const project = await server.project.create({ name: "Notes Sync Project" });
      expect(project.ok).toBe(true);
      if (!project.ok) throw new Error(JSON.stringify(project.error));
      const task = await server.task.create({
        title: "Notes Sync Task",
        projectId: project.value.id,
      });
      expect(task.ok).toBe(true);
      if (!task.ok) throw new Error(JSON.stringify(task.error));
      const note = await server.note.create({
        content: "Created on server",
        entityType: "task",
        entityId: task.value.id,
      });
      expect(note.ok).toBe(true);
      if (!note.ok) throw new Error(JSON.stringify(note.error));

      client = await createTodu({
        storagePath: directory,
        syncClient: true,
        syncPort: started.port,
      });
      expect(client.sync.status()).toMatchObject({
        local: { mode: "ephemeral-client" },
        remote: { state: "disconnected" },
      });
      const projects = await client.project.list();
      expect(projects.ok).toBe(true);
      if (projects.ok) expect(projects.value.map((entry) => entry.id)).toContain(project.value.id);
      await waitFor(
        () => client!.note.list({ entityType: "task", entityId: task.value.id }),
        (result) => result.ok && result.value.some((entry) => entry.id === note.value.id),
      );
      expect(
        (
          await client.note.update(note.value.id, {
            content: "Updated from client",
            tags: ["synced"],
          })
        ).ok,
      ).toBe(true);
      const received = await waitFor(
        () => server!.note.list({ entityType: "task", entityId: task.value.id }),
        (result) =>
          result.ok &&
          result.value.some(
            (entry) => entry.id === note.value.id && entry.content === "Updated from client",
          ),
      );
      expect(received.ok).toBe(true);
      if (received.ok)
        expect(received.value.find((entry) => entry.id === note.value.id)?.tags).toEqual([
          "synced",
        ]);

      const journal = await client.note.create({ content: "Journal from client" });
      expect(journal.ok).toBe(true);
      if (!journal.ok) throw new Error(JSON.stringify(journal.error));
      await waitFor(
        () => server!.note.list(),
        (result) => result.ok && result.value.some((entry) => entry.id === journal.value.id),
      );

      await client.close();
      client = undefined;
      await server.close();
      server = undefined;
      server = await createTodu({ storagePath: directory });
      const persisted = await server.note.get(note.value.id);
      expect(persisted.ok).toBe(true);
      if (persisted.ok)
        expect(persisted.value).toMatchObject({ content: "Updated from client", tags: ["synced"] });
      const persistedJournal = await server.note.get(journal.value.id);
      expect(persistedJournal.ok).toBe(true);
      if (persistedJournal.ok) expect(persistedJournal.value.content).toBe("Journal from client");
    },
  );
});
