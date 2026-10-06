import { once } from "node:events";
import fs from "node:fs";
import { createServer, request } from "node:http";
import os from "node:os";
import path from "node:path";
import type { CatalogDocument, Result } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createTodu } from "./index.js";
import { createPersistentRepo, initBootstrapStorage } from "./storage.js";
import type { Todu } from "./todu.js";

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Native peer synchronization did not converge");
}

describe("opt-in LAN sync listener", () => {
  let directory: string;
  const engines: Todu[] = [];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-lan-listener-"));
  });
  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.close()));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function open(config: Partial<Parameters<typeof createTodu>[0]> = {}): Promise<Todu> {
    const engine = await createTodu({ storagePath: directory, ...config });
    engines.push(engine);
    return engine;
  }

  it("is disabled without explicit enablement and a binding", async () => {
    const engine = await open();
    expect(engine.sync.status().listener).toEqual({ state: "disabled" });
  });

  it("reports an invalid listener configuration without losing local operations", async () => {
    const engine = await open({ syncListener: { enabled: true } });
    expect(engine.sync.status().listener).toMatchObject({
      state: "error",
      error: expect.stringContaining("sync.listener.bind"),
    });
    expect((await engine.project.create({ name: "Local work" })).ok).toBe(true);
  });

  it("keeps the exact configured port on a binding failure and permits local work", async () => {
    const occupied = createServer();
    occupied.listen(0, "127.0.0.1");
    await once(occupied, "listening");
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    try {
      const engine = await open({
        syncListener: { enabled: true, bind: "127.0.0.1", port: address.port },
      });
      expect(engine.sync.status().listener).toEqual({
        state: "error",
        bind: "127.0.0.1",
        port: address.port,
        error: expect.stringMatching(/EADDRINUSE.*Free the configured port/),
      });
      expect((await engine.project.create({ name: "Binding failure is isolated" })).ok).toBe(true);
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it("reports an unavailable address without selecting a different interface", async () => {
    const engine = await open({
      syncListener: { enabled: true, bind: "192.0.2.123", port: await availablePort() },
    });
    expect(engine.sync.status().listener).toMatchObject({
      state: "error",
      bind: "192.0.2.123",
      error: expect.stringContaining("Configure an address assigned to this machine"),
    });
    expect((await engine.project.list()).ok).toBe(true);
  });

  it("accepts only the exact current-catalog WebSocket path and exposes no HTTP administration", async () => {
    const port = await availablePort();
    const engine = await open({ syncListener: { enabled: true, bind: "127.0.0.1", port } });
    const syncPath = `/sync/${engine.sync.getCatalogId()}`;
    await expect(
      fetch(`http://127.0.0.2:${port}/`, { signal: AbortSignal.timeout(1_000) }),
    ).rejects.toThrow();
    expect(engine.sync.status().listener).toEqual({
      state: "listening",
      bind: "127.0.0.1",
      port,
      syncPath,
    });
    for (const route of [
      "/",
      "/sync/other-catalog",
      "/rpc",
      "/daemon/status",
      "/approval",
      "/datasets",
      "/enrollment/requests",
      syncPath,
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: "POST",
        body: JSON.stringify({ method: "daemon.status" }),
      });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found\n");
    }
    for (const route of [
      "/sync/other-catalog",
      "/rpc",
      "/approval",
      `${syncPath}/`,
      `${syncPath}?catalog=other`,
    ]) {
      expect(await rejectedUpgrade(port, route)).toBe(404);
    }
    const socket = new WebSocket(`ws://127.0.0.1:${port}${syncPath}`);
    await once(socket, "open");
    const closed = once(socket, "close");
    socket.close();
    await closed;
  });

  it.each([
    JSON.stringify({ method: "daemon.status", params: {} }),
    new Uint8Array([0xf6]),
  ])("contains invalid native messages without dispatching remote daemon operations: %s", async (message) => {
    const port = await availablePort();
    const engine = await open({ syncListener: { enabled: true, bind: "127.0.0.1", port } });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/sync/${engine.sync.getCatalogId()}`);
    await once(socket, "open");
    const closed = once(socket, "close");
    socket.send(message);
    await closed;
    expect(engine.sync.status().listener.state).toBe("listening");
    expect((await engine.project.create({ name: "Local work after invalid frame" })).ok).toBe(true);
  });

  it("terminates admitted and idle connections on close, releases the port, and can restart", async () => {
    const port = await availablePort();
    const config = { syncListener: { enabled: true, bind: "127.0.0.1", port } };
    const engine = await open(config);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/sync/${engine.sync.getCatalogId()}`);
    await once(socket, "open");
    const closed = once(socket, "close");
    await engine.close();
    engines.splice(engines.indexOf(engine), 1);
    await closed;
    const restarted = await open(config);
    expect(restarted.sync.status().listener.state).toBe("listening");
  });

  it("preserves catalog, native identity, data, server configuration, and registry endpoints", async () => {
    const engine = await open();
    const catalogId = engine.sync.getCatalogId();
    const deviceId = value(await engine.device.localId());
    value(await engine.project.create({ name: "Existing data" }));
    value(await engine.device.setEndpoint(deviceId, "http://existing.lan:24377"));
    await engine.close();
    engines.splice(engines.indexOf(engine), 1);
    const server = "ws://127.0.0.1:1";
    const listening = await open({
      syncListener: { enabled: true, bind: "127.0.0.1", port: await availablePort() },
      remoteSync: { server },
    });
    expect(listening.sync.getCatalogId()).toBe(catalogId);
    expect(value(await listening.device.localId())).toBe(deviceId);
    expect(value(await listening.device.list())).toContainEqual({
      id: deviceId,
      name: os.hostname(),
      endpoint: "http://existing.lan:24377",
    });
    expect(value(await listening.project.list()).map((project) => project.name)).toEqual([
      "Existing data",
    ]);
    expect(listening.sync.status().remote.server).toBe(server);
  });

  it(
    "synchronizes registered persistent peers bidirectionally through the current catalog route",
    { timeout: 20_000 },
    async () => {
      const firstPath = path.join(directory, "first");
      const secondPath = path.join(directory, "second");
      const firstStorage = await initBootstrapStorage(firstPath);
      const catalogId = firstStorage.catalog.documentId;
      const binary = await firstStorage.repo.export(catalogId);
      if (!binary) throw new Error("Missing native catalog export");
      const secondRepo = createPersistentRepo(secondPath);
      secondRepo.import<CatalogDocument>(binary, { docId: catalogId });
      await secondRepo.flush();
      fs.writeFileSync(path.join(secondPath, "todu-catalog.id"), catalogId);
      const secondStorage = await initBootstrapStorage(secondPath, secondRepo);
      const registered = await secondRepo.export(catalogId);
      if (!registered) throw new Error("Missing registered catalog export");
      firstStorage.repo.import<CatalogDocument>(registered, { docId: catalogId });
      await Promise.all([firstStorage.close(), secondStorage.close()]);

      const port = await availablePort();
      const first = await open({
        storagePath: firstPath,
        syncListener: { enabled: true, bind: "127.0.0.1", port },
      });
      const second = await open({
        storagePath: secondPath,
        remoteSync: { server: `ws://127.0.0.1:${port}/sync/${catalogId}` },
      });
      expect(value(await first.device.list())).toHaveLength(2);
      expect(value(await first.device.localId())).not.toBe(value(await second.device.localId()));
      const fromFirst = value(await first.project.create({ name: "From first" }));
      const fromSecond = value(await second.project.create({ name: "From second" }));
      await waitFor(
        async () =>
          value(await first.project.list()).some((project) => project.id === fromSecond.id) &&
          value(await second.project.list()).some((project) => project.id === fromFirst.id),
      );
      const task = value(
        await first.task.create({ title: "Native task document", projectId: fromFirst.id }),
      );
      await waitFor(async () =>
        value(await second.task.list()).some((candidate) => candidate.id === task.id),
      );
      value(await second.task.update(task.id, { title: "Edited by second peer" }));
      await waitFor(
        async () => value(await first.task.get(task.id)).title === "Edited by second peer",
      );
    },
  );
});

function rejectedUpgrade(port: number, route: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: route,
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    req.on("error", reject);
    req.on("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("Unexpected WebSocket acceptance"));
    });
    req.end();
  });
}
