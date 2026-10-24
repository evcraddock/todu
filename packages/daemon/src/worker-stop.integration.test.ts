import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CatalogDocument, createEmptyCatalog, ok } from "@todu/core";
import * as engine from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("awaitable worker shutdown", () => {
  let directory: string;
  let runtime: DaemonRuntime | undefined;
  let expectedFailure: boolean;
  let configureTodu: ((todu: engine.Todu) => void) | undefined;
  let releases: Array<() => void>;
  let hosts: Array<{ todu: engine.Todu; closed: boolean; close: () => Promise<void> }>;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-worker-stop-"));
    expectedFailure = false;
    configureTodu = undefined;
    releases = [];
    hosts = [];
    const create = engine.createTodu;
    vi.spyOn(engine, "createTodu").mockImplementation(async (config) => {
      const todu = await create(config);
      const record = { todu, closed: false, close: todu.close.bind(todu) };
      hosts.push(record);
      vi.spyOn(todu, "close").mockImplementation(async () => {
        await record.close();
        record.closed = true;
      });
      configureTodu?.(todu);
      return todu;
    });
  });

  afterEach(async () => {
    for (const release of releases) release();
    try {
      try {
        await runtime?.stop();
      } catch (error) {
        if (!expectedFailure) throw error;
      }
      for (const host of hosts) if (!host.closed) await host.close();
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(directory, { recursive: true });
    }
  });

  it("preserves immediate legacy synchronous stops", async () => {
    const stop = vi.fn();
    runtime = createDaemonRuntime({
      storagePath: directory,
      logLevel: "error",
      workerRegistrations: [
        { manifest: { type: "legacy", requiredDomains: [] }, runtime: { start: () => ({ stop }) } },
      ],
    });
    await runtime.start();
    expect(runtime.transitionWorkerState("legacy", "stopped")).toMatchObject({
      ok: true,
      value: { state: "stopped" },
    });
    expect(stop).toHaveBeenCalledTimes(1);
    await runtime.stop();
    expect(hosts[0].closed).toBe(true);
  });

  it("shares pending stops, retains truthful snapshots, and rejects reactivation until completion", async () => {
    const release = deferred();
    releases.push(release.resolve);
    const stop = vi.fn(() => release.promise);
    runtime = createDaemonRuntime({
      storagePath: directory,
      logLevel: "error",
      workerRegistrations: [
        {
          manifest: { type: "pending", requiredDomains: [] },
          runtime: { start: () => ({ stop }) },
        },
      ],
    });
    await runtime.start();
    expect(runtime.transitionWorkerState("pending", "stopped")).toMatchObject({
      ok: true,
      value: { state: "running" },
    });
    runtime.transitionWorkerState("pending", "stopped");
    expect(runtime.transitionWorkerState("pending", "running")).toMatchObject({
      ok: false,
      error: { code: "STOP_FAILED" },
    });
    expect(runtime.transitionWorkerState("pending", "blocked")).toMatchObject({
      ok: false,
      error: { code: "STOP_FAILED" },
    });
    const stopping = runtime.stop();
    expect(runtime.transitionWorkerState("pending", "running")).toMatchObject({
      ok: false,
      error: { code: "STOP_FAILED" },
    });
    let completed = false;
    void stopping.then(() => {
      completed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(completed).toBe(false);
    expect(hosts[0].closed).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
    release.resolve();
    await stopping;
    expect(runtime.getWorker("pending")?.state).toBe("stopped");
    expect(hosts[0].closed).toBe(true);
    await runtime.start();
    expect(runtime.getWorker("pending")?.state).toBe("running");
  });

  it.each(["synchronous", "asynchronous"])(
    "surfaces %s cleanup failure, drains the other workers, and refuses runtime reuse",
    async (kind) => {
      expectedFailure = true;
      const release = deferred();
      releases.push(release.resolve);
      const stopped = vi.fn();
      runtime = createDaemonRuntime({
        storagePath: directory,
        logLevel: "error",
        workerRegistrations: [
          {
            manifest: { type: "a-failing", requiredDomains: [] },
            runtime: {
              start: () => ({
                stop() {
                  if (kind === "synchronous") throw new Error("Injected worker cleanup failure");
                  return Promise.reject(new Error("Injected worker cleanup failure"));
                },
              }),
            },
          },
          {
            manifest: { type: "b-pending", requiredDomains: [] },
            runtime: {
              start: () => ({
                async stop() {
                  await release.promise;
                  stopped();
                },
              }),
            },
          },
        ],
      });
      await runtime.start();
      const stopping = runtime.stop();
      const rejection = expect(stopping).rejects.toThrow("Injected worker cleanup failure");
      let settled = false;
      void stopping.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(settled).toBe(false);
      expect(hosts[0].closed).toBe(false);
      release.resolve();
      await rejection;
      expect(stopped).toHaveBeenCalledOnce();
      expect(hosts[0].closed).toBe(false);
      expect(runtime.getWorker("a-failing")?.state).toBe("error");
      await expect(runtime.start()).rejects.toThrow("Previous daemon shutdown failed");
    },
  );

  it("drains an admitted RPC before surfacing worker failure even after the response client disconnects", async () => {
    expectedFailure = true;
    const entered = deferred();
    const release = deferred();
    releases.push(release.resolve);
    let completedWork = false;
    runtime = createDaemonRuntime({
      storagePath: directory,
      logLevel: "error",
      rpcMethodHandlers: {
        "test.pending": async (request) => {
          entered.resolve();
          await release.promise;
          expect(hosts[0].closed).toBe(false);
          completedWork = true;
          return { id: request.id, result: true };
        },
      },
      workerRegistrations: [
        {
          manifest: { type: "failed-cleanup", requiredDomains: [] },
          runtime: {
            start: () => ({
              async stop() {
                throw new Error("Injected cleanup with admitted RPC");
              },
            }),
          },
        },
      ],
    });
    await runtime.start();
    const client = net.createConnection(runtime.config().socketPath);
    releases.push(() => client.destroy());
    await new Promise<void>((resolve, reject) => {
      client.once("error", reject);
      client.once("connect", () => {
        client.off("error", reject);
        resolve();
      });
    });
    client.write(`${JSON.stringify({ id: "pending", method: "test.pending", params: {} })}\n`);
    await entered.promise;
    client.destroy();
    const stopping = runtime.stop();
    const rejection = expect(stopping).rejects.toThrow("Injected cleanup with admitted RPC");
    let settled = false;
    void stopping.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);
    expect(completedWork).toBe(false);
    release.resolve();
    await rejection;
    expect(completedWork).toBe(true);
    expect(hosts[0].closed).toBe(false);
  });

  it("fails a join before changing the marker or opening another engine when worker cleanup fails", async () => {
    expectedFailure = true;
    const storage = await engine.initBootstrapStorage(directory);
    let targetId: string;
    try {
      targetId = storage.repo.create<CatalogDocument>(createEmptyCatalog()).documentId;
      await storage.repo.flush();
    } finally {
      await storage.close();
    }
    runtime = createDaemonRuntime({
      storagePath: directory,
      logLevel: "error",
      workerRegistrations: [
        {
          manifest: { type: "join-failure", requiredDomains: [] },
          runtime: {
            start: () => ({
              async stop() {
                throw new Error("Injected join worker cleanup failure");
              },
            }),
          },
        },
      ],
    });
    await runtime.start();
    const before = runtime.status().catalogId;
    const response = await new Promise<{ error?: { code: string; details: { stage: string } } }>(
      (resolve, reject) => {
        const client = net.createConnection(runtime!.config().socketPath);
        const timer = setTimeout(() => {
          client.destroy();
          reject(new Error("Fixture join timed out"));
        }, 2_000);
        let buffer = "";
        client.setEncoding("utf8");
        client.once("connect", () =>
          client.write(
            `${JSON.stringify({ id: "join", method: "sync.join", params: { catalogId: targetId } })}\n`,
          ),
        );
        client.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        client.on("data", (chunk: string) => {
          buffer += chunk;
          if (buffer.includes("\n")) {
            clearTimeout(timer);
            client.end();
            resolve(JSON.parse(buffer.split("\n")[0]));
          }
        });
      },
    );
    expect(response.error).toMatchObject({
      code: "JOIN_FAILED",
      details: { stage: "worker-stop" },
    });
    expect(runtime.status().catalogId).toBe(before);
    expect(fs.readFileSync(path.join(directory, "todu-catalog.id"), "utf8").trim()).toBe(before);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].closed).toBe(false);
    expect(runtime.transitionWorkerState("join-failure", "registered")).toMatchObject({
      ok: false,
      error: { code: "STOP_FAILED" },
    });
  });

  it("advertises the capability to the source recurring worker and persists its admitted write before close", async () => {
    const entered = deferred();
    const release = deferred();
    releases.push(release.resolve);
    configureTodu = (todu) => {
      vi.spyOn(todu.recurring, "process").mockImplementation(async () => {
        entered.resolve();
        await release.promise;
        expect(hosts[0].closed).toBe(false);
        const project = await todu.project.create({ name: "Admitted recurring work" });
        if (!project.ok) throw new Error(project.error.message);
        const task = await todu.task.create({
          projectId: project.value.id,
          title: "Admitted task",
          description: "Admitted description",
        });
        if (!task.ok) throw new Error(task.error.message);
        const note = await todu.note.create({
          entityType: "task",
          entityId: task.value.id,
          content: "Admitted note",
        });
        if (!note.ok) throw new Error(note.error.message);
        return ok([task.value]);
      });
    };
    runtime = createDaemonRuntime({
      storagePath: directory,
      logLevel: "error",
      assignedWorkerTypes: ["recurring"],
      syncPluginModulePaths: [
        fileURLToPath(new URL("../../recurring-worker/dist/index.js", import.meta.url)),
      ],
    });
    await runtime.start();
    await entered.promise;
    const stopping = runtime.stop();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(hosts[0].closed).toBe(false);
    release.resolve();
    await stopping;
    const reopened = await engine.createTodu({ storagePath: directory });
    try {
      const tasks = await reopened.task.list();
      expect(tasks.ok && tasks.value).toEqual([
        expect.objectContaining({ title: "Admitted task" }),
      ]);
      if (!tasks.ok) throw new Error(tasks.error.message);
      const task = await reopened.task.get(tasks.value[0].id);
      expect(task.ok && task.value).toMatchObject({
        title: "Admitted task",
        description: "Admitted description",
      });
      const notes = await reopened.note.list();
      expect(notes.ok && notes.value).toEqual([
        expect.objectContaining({ content: "Admitted note" }),
      ]);
    } finally {
      await reopened.close();
    }
  });
});
