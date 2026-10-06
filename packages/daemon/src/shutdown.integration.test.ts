import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CatalogDocument, createEmptyCatalog } from "@todu/core";
import * as engine from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDaemonProcess } from "./process.js";
import { createProtocolSuccessFrame } from "./protocol.js";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";
import { createUdsTransport, type UdsTransport } from "./transport.js";

describe("connected-client shutdown", () => {
  let tmpDir: string;
  let runtime: DaemonRuntime | undefined;
  let transport: UdsTransport | undefined;
  let clients: Socket[];
  let releaseWork: (() => void) | undefined;
  let extraCleanup: Array<() => Promise<void>>;
  let child: ChildProcess | undefined;
  let childExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-shutdown-test-"));
    clients = [];
    releaseWork = undefined;
    extraCleanup = [];
    child = undefined;
    childExit = undefined;
  });

  afterEach(async () => {
    releaseWork?.();
    for (const client of clients) client.destroy();
    try {
      if (child && childExit && child.exitCode === null && child.signalCode === null) {
        if (!child.killed) child.kill("SIGTERM");
        try {
          await within(childExit, 3_000);
        } catch (error) {
          child.kill("SIGKILL");
          await childExit;
          throw error;
        }
      }
      await runtime?.stop();
      await transport?.stop();
      for (const cleanup of extraCleanup) await cleanup();
    } finally {
      vi.restoreAllMocks();
      runtime = undefined;
      transport = undefined;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  async function connect(socketPath: string, allowHalfOpen = false): Promise<Socket> {
    const client = net.createConnection({ path: socketPath, allowHalfOpen });
    clients.push(client);
    client.setEncoding("utf8");
    await new Promise<void>((resolve, reject) => {
      client.once("error", reject);
      client.once("connect", () => {
        client.off("error", reject);
        resolve();
      });
    });
    return client;
  }

  it.each([
    false,
    true,
  ])("closes idle clients (allowHalfOpen=%s), handles concurrent stops, and can bind again", async (allowHalfOpen) => {
    transport = createUdsTransport({ storagePath: tmpDir });
    const endpoint = await transport.start();
    const client = await connect(endpoint.path, allowHalfOpen);
    const ended = new Promise<void>((resolve) => client.once("end", resolve));
    client.resume();
    await within(Promise.all([transport.stop(), transport.stop()]), 1_000);
    await within(ended, 1_000);
    client.destroy();
    expect(fs.existsSync(endpoint.path)).toBe(false);
    await transport.start();
    expect(fs.existsSync(endpoint.path)).toBe(true);
  });

  it("closes subscribed clients and reopens the persisted catalog", async () => {
    runtime = createDaemonRuntime({ storagePath: tmpDir, logLevel: "error" });
    await runtime.start();
    const catalogId = runtime.status().catalogId;
    const client = await connect(runtime.config().socketPath);
    const read = frameReader(client);
    const project = await request({
      client,
      read,
      method: "project.create",
      params: { input: { name: "Keep me" } },
    });
    expect(project.result).toMatchObject({ name: "Keep me" });
    await request({
      client,
      read,
      method: "events.subscribe",
      params: { events: ["data.changed"] },
    });
    await within(Promise.all([runtime.stop(), runtime.stop()]), 2_000);
    expect(runtime.status().state).toBe("stopped");
    expect(fs.existsSync(runtime.config().socketPath)).toBe(false);
    await runtime.start();
    expect(runtime.status().catalogId).toBe(catalogId);
    const restartedClient = await connect(runtime.config().socketPath);
    const projects = await request({
      client: restartedClient,
      read: frameReader(restartedClient),
      method: "project.list",
      params: {},
    });
    expect(projects.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Keep me" })]),
    );
  });

  it.each([
    { requestTimeoutMs: 20, disconnected: true },
    { requestTimeoutMs: 30_000, disconnected: false },
  ])("drains actual mutations before storage close ($requestTimeoutMs ms timeout, disconnected=$disconnected)", async ({
    requestTimeoutMs,
    disconnected,
  }) => {
    const entered = deferred();
    const release = deferred();
    releaseWork = release.resolve;
    let storageClosed = false;
    let writes = 0;
    const createTodu = engine.createTodu;
    vi.spyOn(engine, "createTodu").mockImplementation(async (options) => {
      const todu = await createTodu(options);
      const createProject = todu.project.create;
      vi.spyOn(todu.project, "create").mockImplementation(async (input) => {
        entered.resolve();
        await release.promise;
        expect(storageClosed).toBe(false);
        writes += 1;
        return createProject(input);
      });
      const close = todu.close;
      vi.spyOn(todu, "close").mockImplementation(async () => {
        storageClosed = true;
        await close();
      });
      return todu;
    });
    runtime = createDaemonRuntime({ storagePath: tmpDir, requestTimeoutMs, logLevel: "error" });
    await runtime.start();
    const client = await connect(runtime.config().socketPath);
    const read = frameReader(client);
    const pending = request({
      client,
      read,
      method: "project.create",
      params: { input: { name: "Delayed" } },
    });
    await entered.promise;
    if (disconnected) {
      expect((await pending).error).toMatchObject({ code: "TIMEOUT" });
      client.destroy();
    }
    let stopped = false;
    const stopping = runtime.stop().then(() => {
      stopped = true;
    });
    await delay(50);
    expect(stopped).toBe(false);
    expect(storageClosed).toBe(false);
    release.resolve();
    if (!disconnected) {
      expect((await pending).result).toMatchObject({ name: "Delayed" });
    }
    await within(stopping, 2_000);
    expect(writes).toBe(1);
    expect(storageClosed).toBe(true);
    vi.restoreAllMocks();
    await runtime.start();
    const reopened = await connect(runtime.config().socketPath);
    const projects = await request({
      client: reopened,
      read: frameReader(reopened),
      method: "project.list",
      params: {},
    });
    expect(projects.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Delayed" })]),
    );
  });

  it.each([
    false,
    true,
  ])("rejects requests while an accepted handler drains (queued=%s)", async (queued) => {
    const entered = deferred();
    const release = deferred();
    releaseWork = release.resolve;
    let calls = 0;
    runtime = createDaemonRuntime({
      storagePath: tmpDir,
      requestTimeoutMs: 20,
      logLevel: "error",
      rpcMethodHandlers: {
        "test.work": async (request) => {
          calls += 1;
          entered.resolve();
          await release.promise;
          return createProtocolSuccessFrame(request.id, true);
        },
      },
    });
    await runtime.start();
    const client = await connect(runtime.config().socketPath);
    const read = frameReader(client);
    const first = request({ client, read, method: "test.work", params: {} });
    if (queued)
      client.write(`${JSON.stringify({ id: "queued", method: "test.work", params: {} })}\n`);
    await entered.promise;
    const stopping = runtime.stop();
    expect((await first).error).toMatchObject({ code: "TIMEOUT" });
    const rejected = queued
      ? await read()
      : await request({ client, read, method: "test.work", params: {} });
    expect(rejected.error).toMatchObject({ code: "DAEMON_UNAVAILABLE" });
    expect(calls).toBe(1);
    release.resolve();
    await within(stopping, 2_000);
  });

  it("closes the final engine after an accepted join without restarting workers", async () => {
    const storage = await engine.initBootstrapStorage(tmpDir);
    let targetId: string;
    try {
      const alternate = storage.repo.create<CatalogDocument>(createEmptyCatalog());
      targetId = alternate.documentId;
      await storage.repo.flush();
    } finally {
      await storage.close();
    }
    const entered = deferred();
    const release = deferred();
    releaseWork = release.resolve;
    const closeCounts: number[] = [];
    const createTodu = engine.createTodu;
    vi.spyOn(engine, "createTodu").mockImplementation(async (options) => {
      const index = closeCounts.length;
      if (index === 1) {
        entered.resolve();
        await release.promise;
      }
      const todu = await createTodu(options);
      closeCounts.push(0);
      const close = todu.close;
      vi.spyOn(todu, "close").mockImplementation(async () => {
        closeCounts[index] += 1;
        await close();
      });
      extraCleanup.push(async () => {
        if (closeCounts[index] === 0) await close();
      });
      return todu;
    });
    let workerStarts = 0;
    runtime = createDaemonRuntime({
      storagePath: tmpDir,
      logLevel: "error",
      workerRegistrations: [
        {
          manifest: { type: "test-worker", requiredDomains: [] },
          runtime: {
            start() {
              workerStarts += 1;
              return { stop() {} };
            },
          },
        },
      ],
    });
    await runtime.start();
    const client = await connect(runtime.config().socketPath);
    const joining = request({
      client,
      read: frameReader(client),
      method: "sync.join",
      params: { catalogId: targetId },
    });
    await within(entered.promise, 2_000);
    const stopping = runtime.stop();
    release.resolve();
    expect((await joining).result).toMatchObject({ switched: true, targetCatalogId: targetId });
    await within(stopping, 2_000);
    expect(closeCounts).toEqual([1, 1]);
    expect(workerStarts).toBe(1);
  });

  it("reports storage close failure instead of claiming successful shutdown", async () => {
    const createTodu = engine.createTodu;
    vi.spyOn(engine, "createTodu").mockImplementation(async (options) => {
      const todu = await createTodu(options);
      const close = todu.close;
      vi.spyOn(todu, "close").mockImplementation(async () => {
        await close();
        throw new Error("Injected storage close failure");
      });
      return todu;
    });
    runtime = createDaemonRuntime({ storagePath: tmpDir, logLevel: "error" });
    await runtime.start();
    await expect(runtime.stop()).rejects.toThrow("Injected storage close failure");
    await expect(runtime.start()).rejects.toThrow("Previous daemon shutdown failed");
    runtime = undefined;
  });

  it("keeps shutdown alive until a disconnected handler with an unreferenced timer finishes", async () => {
    const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
    const source = new URL("./process.ts", import.meta.url).href;
    const script = `
      import { startDaemonProcess } from ${JSON.stringify(source)};
      async function main() {
        const daemon = await startDaemonProcess({
          storagePath: ${JSON.stringify(tmpDir)}, requestTimeoutMs: 20, logLevel: "error",
          rpcMethodHandlers: { "test.pending": async (request) => {
            await new Promise((resolve) => setTimeout(resolve, 400).unref());
            console.log("HANDLER_COMPLETED");
            return { id: request.id, result: true };
          } },
        }, { hooks: {
          onStarted: () => console.log("FIXTURE_READY"),
          onStopped: () => console.log("CLEAN_STOP"),
        } });
        await daemon.waitForShutdown();
      }
      main().catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith("TODU_")),
    );
    child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: rootDir,
      env: { ...env, HOME: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      logs += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      logs += chunk.toString();
    });
    childExit = new Promise((resolve, reject) => {
      child?.once("error", reject);
      child?.once("close", (code, signal) => resolve({ code, signal }));
    });
    const deadline = Date.now() + 5_000;
    while (!logs.includes("FIXTURE_READY")) {
      if (child.exitCode !== null || Date.now() >= deadline)
        throw new Error(`Child daemon did not start: ${logs}`);
      await delay(20);
    }
    const client = await connect(path.join(tmpDir, "daemon.sock"));
    const response = await request({
      client,
      read: frameReader(client),
      method: "test.pending",
      params: {},
    });
    expect(response.error).toMatchObject({ code: "TIMEOUT" });
    client.destroy();
    child.kill("SIGTERM");
    expect(await within(childExit, 2_000)).toEqual({ code: 0, signal: null });
    expect(logs).toContain("HANDLER_COMPLETED");
    expect(logs).toContain("CLEAN_STOP");
    expect(logs.indexOf("HANDLER_COMPLETED")).toBeLessThan(logs.indexOf("CLEAN_STOP"));
    expect(fs.existsSync(path.join(tmpDir, "daemon.sock"))).toBe(false);
  }, 10_000);

  it("propagates process shutdown failures without firing the successful stopped hook", async () => {
    const stopped = vi.fn();
    const daemon = await startDaemonProcess(
      { storagePath: tmpDir, logLevel: "error" },
      { registerSignalHandlers: false, hooks: { onStopped: stopped } },
    );
    const stop = daemon.runtime.stop.bind(daemon.runtime);
    vi.spyOn(daemon.runtime, "stop").mockImplementation(async () => {
      await stop();
      throw new Error("Injected process shutdown failure");
    });
    await expect(daemon.stop()).rejects.toThrow("Injected process shutdown failure");
    await expect(daemon.waitForShutdown()).rejects.toThrow("Injected process shutdown failure");
    expect(stopped).not.toHaveBeenCalled();
  });

  it("exits naturally on repeated SIGTERM with a persistent subscribed client and reopens writes", async () => {
    const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
    const configPath = path.join(tmpDir, "config.yaml");
    const socketPath = path.join(tmpDir, "daemon.sock");
    fs.writeFileSync(configPath, "sync:\n  remote:\n    enabled: false\n");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith("TODU_")),
    );
    child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(rootDir, "packages/daemon/src/entrypoint.ts")],
      {
        cwd: rootDir,
        env: {
          ...env,
          HOME: tmpDir,
          TODU_CONFIG: configPath,
          TODU_DATA_DIR: tmpDir,
          TODU_DAEMON_SOCKET: socketPath,
          TODU_SYNC_ENABLED: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      logs += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      logs += chunk.toString();
    });
    childExit = new Promise((resolve, reject) => {
      child?.once("error", reject);
      child?.once("close", (code, signal) => resolve({ code, signal }));
    });
    const deadline = Date.now() + 5_000;
    while (!logs.includes("daemon process started")) {
      if (child.exitCode !== null || Date.now() >= deadline)
        throw new Error(`Child daemon did not start: ${logs}`);
      await delay(20);
    }
    const client = await connect(socketPath);
    const read = frameReader(client);
    await request({
      client,
      read,
      method: "events.subscribe",
      params: { events: ["data.changed"] },
    });
    const project = await request({
      client,
      read,
      method: "project.create",
      params: { input: { name: "SIGTERM persisted" } },
    });
    expect(project.result).toMatchObject({ name: "SIGTERM persisted" });
    child.kill("SIGTERM");
    await delay(20);
    child.kill("SIGTERM");
    expect(await within(childExit, 2_000)).toEqual({ code: 0, signal: null });
    expect(logs).toContain("daemon process stopped");
    expect(logs).not.toMatch(
      /shutdown failed|TimeoutNegativeWarning|UnhandledPromiseRejection|ENOENT/,
    );
    expect(fs.existsSync(socketPath)).toBe(false);
    const reopened = await engine.createTodu({ storagePath: tmpDir });
    try {
      const projects = await reopened.project.list();
      expect(projects.ok).toBe(true);
      if (projects.ok)
        expect(projects.value).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "SIGTERM persisted" })]),
        );
    } finally {
      await reopened.close();
    }
  }, 10_000);
});

type Frame = { id?: string; result?: unknown; error?: { code: string } };

function frameReader(client: Socket): () => Promise<Frame> {
  let buffer = "";
  const frames: Frame[] = [];
  const waiters: Array<(frame: Frame) => void> = [];
  client.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const frame = JSON.parse(line) as Frame;
      if (!frame.id) continue;
      const waiter = waiters.shift();
      if (waiter) waiter(frame);
      else frames.push(frame);
    }
  });
  return () => {
    const queued = frames.shift();
    if (queued) return Promise.resolve(queued);
    return within(new Promise<Frame>((resolve) => waiters.push(resolve)), 2_000);
  };
}

let nextId = 0;
async function request(options: {
  client: Socket;
  read: () => Promise<Frame>;
  method: string;
  params: Record<string, unknown>;
}): Promise<Frame> {
  const { client, read, method, params } = options;
  client.write(`${JSON.stringify({ id: `shutdown-${nextId++}`, method, params })}\n`);
  return read();
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Shutdown test exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
