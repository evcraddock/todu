import { once } from "node:events";
import fs from "node:fs";
import { createServer, request } from "node:http";
import os from "node:os";
import path from "node:path";
import { type CatalogDocument, createEmptyCatalog, resolveEnrollmentEndpoint } from "@todu/core";
import { initBootstrapStorage, type SyncStatus } from "@todu/engine";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSyncCommands } from "../../cli/src/commands/sync.js";
import { loadConfig } from "../../cli/src/config.js";
import { invokeDaemonMethod } from "../../cli/src/daemon-transport.js";
import { loadDaemonFileConfig } from "./config.js";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";
import { createNoopWorkerRuntime } from "./workers.js";

describe("daemon LAN listener ownership", () => {
  let directory: string;
  const runtimes: DaemonRuntime[] = [];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-listener-"));
  });
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.exitCode = undefined;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function rpc<T>(runtime: DaemonRuntime, method: string, params: Record<string, unknown> = {}) {
    return invokeDaemonMethod<T>({ socketPath: runtime.config().socketPath, method, params });
  }

  it("loads listener settings from the local file without changing remote or worker configuration", () => {
    const configPath = path.join(directory, "config.yaml");
    fs.writeFileSync(
      configPath,
      "sync:\n  listener:\n    enabled: true\n    bind: 127.0.0.1\n  remote:\n    enabled: true\n    server: ws://existing.lan:3030\ndaemon:\n  workers:\n    assigned: []\n",
    );
    vi.stubEnv("TODU_CONFIG", configPath);
    vi.stubEnv("TODU_SYNC_SERVER", "");
    vi.stubEnv("TODU_SYNC_ENABLED", "");
    const loaded = loadDaemonFileConfig();
    expect(loaded.syncListener).toEqual({ enabled: true, bind: "127.0.0.1" });
    expect(loaded.remoteSync).toEqual({ server: "ws://existing.lan:3030" });
    expect(loaded.fileConfig.daemon?.workers?.assigned).toEqual([]);
  });

  it("applies a no-argument enablement only after restart, retaining saved binding, enrollment endpoint, and dataset identity", async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const configPath = path.join(directory, "config.yaml");
    const storagePath = path.join(directory, "data");
    fs.writeFileSync(
      configPath,
      `sync:\n  listener:\n    enabled: false\n    bind: 127.0.0.1\n    port: ${address.port}\n  remote:\n    server: ws://existing.lan:3030\n    enabled: false\ndaemon:\n  workers:\n    assigned: []\n`,
    );
    const storage = await initBootstrapStorage(storagePath);
    const catalogId = storage.catalog.documentId;
    const nativeId = await storage.repo.storageId();
    await storage.close();
    const runtime = createDaemonRuntime({
      storagePath,
      syncListener: loadConfig(configPath).sync?.listener,
    });
    runtimes.push(runtime);
    await runtime.start();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const program = new Command().option("--config <path>");
    const invoke = vi.fn();
    registerSyncCommands(program, invoke);
    await program.parseAsync(["--config", configPath, "sync", "listener", "enable"], {
      from: "user",
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(await rpc(runtime, "sync.status")).toMatchObject({
      ok: true,
      value: { listener: { state: "disabled" } },
    });
    const listener = loadConfig(configPath).sync?.listener;
    expect(listener).toEqual({ enabled: true, bind: "127.0.0.1", port: address.port });
    await runtime.stop();
    const restarted = createDaemonRuntime({ storagePath, syncListener: listener });
    runtimes.push(restarted);
    await restarted.start();
    expect(await rpc(restarted, "sync.status")).toMatchObject({
      ok: true,
      value: {
        listener: {
          state: "listening",
          bind: "127.0.0.1",
          port: address.port,
          syncPath: `/sync/${catalogId}`,
        },
      },
    });
    expect(await rpc(restarted, "device.localId")).toEqual({ ok: true, value: nativeId });
    expect(resolveEnrollmentEndpoint({ listener })).toEqual({
      ok: true,
      value: `http://127.0.0.1:${address.port}`,
    });
    const response = await fetch(`http://127.0.0.1:${address.port}/rpc`);
    expect(response.status).toBe(404);
    await restarted.stop();
    const reopened = await initBootstrapStorage(storagePath);
    try {
      expect(reopened.catalog.documentId).toBe(catalogId);
      expect(await reopened.repo.storageId()).toBe(nativeId);
    } finally {
      await reopened.close();
    }
  });

  it("exposes disabled-by-default listener status only through private daemon RPC", async () => {
    const runtime = createDaemonRuntime({ storagePath: directory });
    runtimes.push(runtime);
    await runtime.start();
    expect(await rpc<SyncStatus>(runtime, "sync.status")).toMatchObject({
      ok: true,
      value: { listener: { state: "disabled" } },
    });
  });

  it.each([
    "occupied port",
    "missing bind",
  ])("keeps private reads, edits, and health available after %s", async (failure) => {
    const occupied = createServer();
    occupied.listen(0, "127.0.0.1");
    await once(occupied, "listening");
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    try {
      const runtime = createDaemonRuntime({
        storagePath: directory,
        syncListener:
          failure === "missing bind"
            ? { enabled: true }
            : { enabled: true, bind: "127.0.0.1", port: address.port },
      });
      runtimes.push(runtime);
      await runtime.start();
      expect(await rpc(runtime, "daemon.status")).toMatchObject({
        ok: true,
        value: { healthy: true, state: "running" },
      });
      expect(await rpc(runtime, "sync.status")).toMatchObject({
        ok: true,
        value: {
          listener: {
            state: "error",
            error: expect.stringContaining("Local daemon operations remain available"),
          },
        },
      });
      expect(
        await rpc(runtime, "project.create", { input: { name: "Local edits still work" } }),
      ).toMatchObject({ ok: true, value: { name: "Local edits still work" } });
      expect(await rpc(runtime, "project.list")).toMatchObject({
        ok: true,
        value: [{ name: "Local edits still work" }],
      });
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it("rebinds only the newly attached catalog after an explicit existing local join", async () => {
    const storage = await initBootstrapStorage(directory);
    const previousCatalogId = storage.catalog.documentId;
    const alternateCatalogId = storage.repo.create<CatalogDocument>(
      createEmptyCatalog(),
    ).documentId;
    await storage.close();
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const runtime = createDaemonRuntime({
      storagePath: directory,
      syncListener: { enabled: true, bind: "127.0.0.1", port: address.port },
    });
    runtimes.push(runtime);
    await runtime.start();
    expect(await rpc(runtime, "sync.status")).toMatchObject({
      ok: true,
      value: { listener: { syncPath: `/sync/${previousCatalogId}` } },
    });
    expect(await rpc(runtime, "sync.join", { catalogId: alternateCatalogId })).toMatchObject({
      ok: true,
      value: { switched: true },
    });
    expect(await rpc(runtime, "sync.status")).toMatchObject({
      ok: true,
      value: {
        listener: {
          state: "listening",
          port: address.port,
          syncPath: `/sync/${alternateCatalogId}`,
        },
      },
    });
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        `http://127.0.0.1:${address.port}/sync/${previousCatalogId}`,
        {
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
        reject(new Error("Previous catalog unexpectedly accepted"));
      });
      req.end();
    });
    expect(status).toBe(404);
  });

  it("preserves worker assignments and starts no additional executor when listening", async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const assignedStart = vi.fn(() => ({ stop: vi.fn(() => {}) }));
    const unassignedStart = vi.fn(createNoopWorkerRuntime().start);
    const runtime = createDaemonRuntime({
      storagePath: directory,
      syncListener: { enabled: true, bind: "127.0.0.1", port: address.port },
      assignedWorkerTypes: ["existing-worker"],
      workerRegistrations: [
        {
          manifest: { type: "existing-worker", requiredDomains: ["task"] },
          runtime: { start: assignedStart },
        },
        {
          manifest: { type: "unassigned-worker", requiredDomains: ["task"] },
          runtime: { start: unassignedStart },
        },
      ],
    });
    runtimes.push(runtime);
    await runtime.start();
    expect(await rpc(runtime, "sync.status")).toMatchObject({
      ok: true,
      value: { listener: { state: "listening" } },
    });
    expect(runtime.config().assignedWorkerTypes).toEqual(["existing-worker"]);
    expect(assignedStart).toHaveBeenCalledTimes(1);
    expect(unassignedStart).not.toHaveBeenCalled();
    expect(runtime.getWorker("unassigned-worker")?.state).toBe("blocked");
    const response = await fetch(`http://127.0.0.1:${address.port}/rpc`, {
      method: "POST",
      body: JSON.stringify({ method: "worker.start" }),
    });
    expect(response.status).toBe(404);
    expect(unassignedStart).not.toHaveBeenCalled();
  });
});
