import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { DocumentId } from "@automerge/automerge-repo";
import {
  createDeviceId,
  type DeviceId,
  type EnrollmentClientStatus,
  type EnrollmentRequest,
  err,
  type Project,
  storageError,
} from "@todu/core";
import * as engine from "@todu/engine";
import {
  beginCatalogJoinSwitch,
  createEnrollmentPeerConnection,
  initJoinStorage,
  prepareEnrollmentStorage,
  readEnrollmentState,
} from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { invokeDaemonMethod } from "../../cli/src/daemon-transport.js";
import * as engineStorage from "../../engine/src/storage.js";
import { createPersistentRepo } from "../../engine/src/storage.js";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";

describe("locally approved device enrollment", { timeout: 30_000 }, () => {
  let directory: string;
  let clientPort: number;
  const runtimes: DaemonRuntime[] = [];
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-enrollment-"));
    clientPort = await reservePort();
  });
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function runtime(name: string, options: Parameters<typeof createDaemonRuntime>[0] = {}) {
    const instance = createDaemonRuntime({
      storagePath: path.join(directory, name),
      assignedWorkerTypes: [],
      logLevel: "error",
      syncListener: { enabled: true, bind: "127.0.0.1", port: clientPort },
      ...options,
    });
    runtimes.push(instance);
    return instance;
  }
  function rpc<T>(instance: DaemonRuntime, method: string, params: Record<string, unknown> = {}) {
    return invokeDaemonMethod<T>({ socketPath: instance.config().socketPath, method, params });
  }
  async function value<T>(
    instance: DaemonRuntime,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const result = await rpc<T>(instance, method, params);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
  }
  async function reservePort() {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return address.port;
  }
  async function source() {
    const port = await reservePort();
    const instance = runtime("source", {
      syncListener: { enabled: true, bind: "127.0.0.1", port },
    });
    await instance.start();
    return { instance, endpoint: `http://127.0.0.1:${port}`, port };
  }
  function prepare(name = "client") {
    const storagePath = path.join(directory, name);
    const prepared = prepareEnrollmentStorage({ storagePath });
    expect(prepared.ok).toBe(true);
    return storagePath;
  }
  async function active(instance: DaemonRuntime, catalogId: string) {
    await vi.waitFor(
      async () => {
        expect(
          await value<EnrollmentClientStatus>(instance, "sync.enrollmentStatus"),
        ).toMatchObject({ stage: "active", catalogId });
      },
      { timeout: 15_000, interval: 50 },
    );
  }
  function documentFiles(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? documentFiles(path.join(root, entry.name))
          : /\/(snapshot|incremental)\//.test(path.join(root, entry.name))
            ? [path.join(root, entry.name)]
            : [],
      );
  }

  it.each([
    "disable",
    "enable",
    "repoint",
    "failed apply",
    "shutdown",
  ])("coordinates %s with barrier-held pristine engine construction", async (action) => {
    const receiving = await source();
    const clientPath = prepare();
    const configPath = path.join(clientPath, "config.yaml");
    const settings = { server: "ws://127.0.0.1:1", enabled: action === "disable" };
    fs.writeFileSync(
      configPath,
      `sync:\n  remote:\n    server: ${settings.server}\n    enabled: ${settings.enabled}\n`,
    );
    const joining = runtime("client", { configPath, remoteSyncSettings: settings });
    await joining.start();
    const release = Promise.withResolvers<void>();
    let constructed: engine.Todu | undefined;
    const create = engine.createTodu;
    vi.spyOn(engine, "createTodu").mockImplementation(async (config) => {
      const created = await create(config);
      if (config.storagePath === clientPath && config.joinedStorage) {
        constructed = created;
        await release.promise;
      }
      return created;
    });
    try {
      const requested = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
        endpoint: receiving.endpoint,
      });
      await value(receiving.instance, "sync.enrollmentApprove", { requestId: requested.requestId });
      await expect.poll(() => Boolean(constructed), { timeout: 15000 }).toBe(true);
      expect(joining.status().catalogId).toBeUndefined();
      const update =
        action === "disable"
          ? { enabled: false }
          : action === "enable"
            ? { enabled: true }
            : { server: "ws://127.0.0.1:2" };
      const expected = { ...settings, ...update };
      expect(
        await value(joining, "sync.serverConfigure", { settings: update, configPath }),
      ).toMatchObject({ ...expected, running: false });
      expect(parse(fs.readFileSync(configPath, "utf8")).sync.remote).toEqual(expected);
      expect(joining.config().remoteSyncSettings).toEqual(expected);
      if (action === "failed apply") {
        vi.spyOn(constructed!.sync, "configureServer").mockResolvedValueOnce(
          err(storageError("Injected activation settings failure")),
        );
        const close = vi.spyOn(constructed!, "close");
        release.resolve();
        await expect.poll(() => close.mock.calls.length, { timeout: 15000 }).toBe(1);
        expect(joining.status().catalogId).toBeUndefined();
        expect(readEnrollmentState(clientPath)?.mode).toBe("pending");
      } else if (action === "shutdown") {
        const stop = joining.stop();
        release.resolve();
        await stop;
        expect(joining.status().catalogId).toBeUndefined();
        expect(readEnrollmentState(clientPath)?.mode).toBe("pending");
      } else {
        release.resolve();
        await active(joining, receiving.instance.status().catalogId!);
        expect(await value(joining, "sync.serverStatus")).toMatchObject({
          ...expected,
          running: expected.enabled,
        });
        expect(constructed!.sync.serverStatus()).toMatchObject({
          ...expected,
          running: expected.enabled,
        });
      }
      expect(parse(fs.readFileSync(configPath, "utf8")).sync.remote).toEqual(expected);
      expect(joining.config().remoteSyncSettings).toEqual(expected);
    } finally {
      release.resolve();
    }
  });

  it("keeps pristine startup inert, then attaches the approved catalog and replicates both ways without enabling workers", async () => {
    const receiving = await source();
    const sourceCatalog = receiving.instance.status().catalogId!;
    await value(receiving.instance, "project.create", { input: { name: "Original project" } });
    const clientPath = prepare();
    const workerStart = vi.fn(() => ({ stop() {} }));
    fs.writeFileSync(path.join(clientPath, "provider-state.json"), '{"existing":"unchanged"}');
    const joining = runtime("client", {
      assignedWorkerTypes: ["existing-worker"],
      workerRegistrations: [
        {
          manifest: { type: "existing-worker", requiredDomains: ["task"] },
          runtime: { start: workerStart },
        },
      ],
    });
    await joining.start();
    const prepared = await value<EnrollmentClientStatus>(joining, "sync.enrollmentStatus");
    expect(prepared).toMatchObject({ stage: "prepared", deviceId: expect.any(String) });
    expect(joining.status().catalogId).toBeUndefined();
    expect(workerStart).not.toHaveBeenCalled();
    expect(await rpc(joining, "project.list")).toMatchObject({
      ok: false,
      error: { code: "PRECONDITION_FAILED" },
    });
    const requested = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
      endpoint: receiving.endpoint,
    });
    expect(requested).toMatchObject({ stage: "pending", deviceId: prepared.deviceId });
    const requests = await value<EnrollmentRequest[]>(
      receiving.instance,
      "sync.enrollmentRequests",
    );
    expect(requests).toHaveLength(1);
    expect(documentFiles(clientPath)).toEqual([]);
    expect(fs.existsSync(path.join(clientPath, "todu-catalog.id"))).toBe(false);
    const publicStatus = await fetch(
      `${receiving.endpoint}/enrollment/requests/${requested.requestId}`,
    ).then((response) => response.json());
    expect(Object.keys(publicStatus).sort()).toEqual(["expiresAt", "requestId", "state"]);
    expect(
      await fetch(`${receiving.endpoint}/enrollment/requests/${requested.requestId}/approve`, {
        method: "POST",
      }).then((response) => response.status),
    ).toBe(404);
    await value(receiving.instance, "sync.enrollmentApprove", { requestId: requested.requestId });
    await active(joining, sourceCatalog);
    expect(joining.status().catalogId).toBe(sourceCatalog);
    expect(await value(joining, "device.localId")).toBe(prepared.deviceId);
    expect(workerStart).not.toHaveBeenCalled();
    expect(joining.config().assignedWorkerTypes).toEqual(["existing-worker"]);
    expect(fs.readFileSync(path.join(clientPath, "provider-state.json"), "utf-8")).toBe(
      '{"existing":"unchanged"}',
    );
    await vi.waitFor(
      async () =>
        expect(await value<Project[]>(joining, "project.list")).toEqual([
          expect.objectContaining({ name: "Original project" }),
        ]),
      { timeout: 5_000 },
    );
    await value(joining, "project.create", { input: { name: "Client contribution" } });
    await vi.waitFor(
      async () =>
        expect(await value<Project[]>(receiving.instance, "project.list")).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "Client contribution" })]),
        ),
      { timeout: 5_000 },
    );
    await joining.stop();
    await joining.start();
    expect(await value(joining, "device.localId")).toBe(prepared.deviceId);
    expect(joining.status().catalogId).toBe(sourceCatalog);
    await value(receiving.instance, "project.create", { input: { name: "After restart" } });
    await vi.waitFor(
      async () =>
        expect(await value<Project[]>(joining, "project.list")).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "After restart" })]),
        ),
      { timeout: 5_000 },
    );
  });

  it.each([
    "separate configured server",
    "same configured source",
  ])("preserves an existing same-dataset replica, data, provider state, and workers with %s", async (serverMode) => {
    const receiving = await source();
    const catalogId = receiving.instance.status().catalogId!;
    const clientPath = path.join(directory, "client");
    const repo = createPersistentRepo(clientPath);
    const replica = createDeviceId((await repo.storageId())!);
    const sourceId = await value<DeviceId>(receiving.instance, "device.localId");
    const connection = createEnrollmentPeerConnection({
      repo,
      source: {
        endpoint: receiving.endpoint,
        approval: {
          catalogId,
          deviceId: replica,
          sourceDeviceId: sourceId,
          syncPath: `/sync/${catalogId}`,
        },
      },
    });
    await connection.ready();
    const storage = await initJoinStorage(clientPath, catalogId as DocumentId, repo);
    await repo.flush([storage.catalog.documentId]);
    beginCatalogJoinSwitch(clientPath, catalogId as DocumentId).commit();
    connection.close();
    await storage.close();
    fs.writeFileSync(path.join(clientPath, "provider-state.json"), "existing provider cursor");
    const workerStop = vi.fn();
    const workerStart = vi.fn(() => ({ stop: workerStop }));
    const makeRepo = engineStorage.createPersistentRepo;
    let liveRepo: ReturnType<typeof createPersistentRepo> | undefined;
    vi.spyOn(engineStorage, "createPersistentRepo").mockImplementation((storagePath) => {
      const created = makeRepo(storagePath);
      if (storagePath === clientPath) liveRepo = created;
      return created;
    });
    const sourceSyncUrl = `${receiving.endpoint.replace("http:", "ws:")}/sync/${catalogId}`;
    const originalServer =
      serverMode === "same configured source"
        ? sourceSyncUrl
        : `ws://127.0.0.1:${await reservePort()}`;
    const joining = runtime("client", {
      remoteSync: { server: originalServer },
      assignedWorkerTypes: ["existing-worker"],
      workerRegistrations: [
        {
          manifest: { type: "existing-worker", requiredDomains: ["task"] },
          runtime: { start: workerStart },
        },
      ],
    });
    await joining.start();
    const originalConfig = joining.config();
    const project = await value<Project>(joining, "project.create", {
      input: { name: "Previously local project" },
    });
    await value(joining, "task.create", {
      input: { projectId: project.id, title: "Previously local task" },
    });
    const requested = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
      endpoint: receiving.endpoint,
    });
    expect(requested.stage).toBe("pending");
    await value(receiving.instance, "sync.enrollmentApprove", { requestId: requested.requestId });
    await active(joining, catalogId);
    expect(await value(joining, "device.localId")).toBe(replica);
    expect(joining.status().catalogId).toBe(catalogId);
    expect(workerStart).toHaveBeenCalledTimes(1);
    expect(workerStop).not.toHaveBeenCalled();
    expect(joining.config()).toEqual(originalConfig);
    expect(joining.config().remoteSync).toEqual({ server: originalServer });
    expect(liveRepo).toBeDefined();
    const sourceAdapters = () =>
      liveRepo!.networkSubsystem.adapters.filter(
        (adapter) => "url" in adapter && adapter.url === sourceSyncUrl,
      );
    expect(sourceAdapters()).toHaveLength(1);
    expect(
      await value<EnrollmentClientStatus>(joining, "sync.enroll", { endpoint: receiving.endpoint }),
    ).toMatchObject({ stage: "active", deviceId: replica });
    expect(sourceAdapters()).toHaveLength(1);
    expect(fs.readFileSync(path.join(clientPath, "provider-state.json"), "utf-8")).toBe(
      "existing provider cursor",
    );
    await vi.waitFor(
      async () =>
        expect(await value(receiving.instance, "task.list")).toEqual(
          expect.arrayContaining([expect.objectContaining({ title: "Previously local task" })]),
        ),
      { timeout: 5_000 },
    );
    expect(await value(joining, "task.list")).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Previously local task" })]),
    );
  });

  it("refuses a different initialized dataset even when empty without touching catalog, identity, settings, provider state, or workers", async () => {
    const receiving = await source();
    const start = vi.fn(() => ({ stop() {} }));
    const joining = runtime("client", {
      assignedWorkerTypes: ["existing-worker"],
      workerRegistrations: [
        { manifest: { type: "existing-worker", requiredDomains: ["task"] }, runtime: { start } },
      ],
    });
    await joining.start();
    const catalog = joining.status().catalogId;
    const replica = await value(joining, "device.localId");
    const config = joining.config();
    fs.writeFileSync(path.join(joining.config().storagePath, "provider-state.json"), "untouched");
    expect(await rpc(joining, "sync.enroll", { endpoint: receiving.endpoint })).toMatchObject({
      ok: false,
    });
    expect(joining.status().catalogId).toBe(catalog);
    expect(await value(joining, "device.localId")).toBe(replica);
    expect(joining.config()).toEqual(config);
    expect(start).toHaveBeenCalledTimes(1);
    expect(await value(joining, "project.list")).toEqual([]);
    expect(await value(joining, "task.list")).toEqual([]);
    expect(fs.readFileSync(path.join(config.storagePath, "provider-state.json"), "utf-8")).toBe(
      "untouched",
    );
    expect(fs.existsSync(path.join(config.storagePath, "todu-enrollment.json"))).toBe(false);
    expect(await value(receiving.instance, "sync.enrollmentRequests")).toEqual([]);
  });

  it("denies without transferring documents, creating a catalog, or removing existing membership", async () => {
    const receiving = await source();
    const clientPath = prepare();
    const joining = runtime("client");
    await joining.start();
    const requested = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
      endpoint: receiving.endpoint,
    });
    const originalMembers = await value(receiving.instance, "device.list");
    await value(receiving.instance, "sync.enrollmentDeny", { requestId: requested.requestId });
    await vi.waitFor(
      async () =>
        expect(await value<EnrollmentClientStatus>(joining, "sync.enrollmentStatus")).toMatchObject(
          { stage: "denied" },
        ),
      { timeout: 5_000 },
    );
    expect(joining.status().catalogId).toBeUndefined();
    expect(documentFiles(clientPath)).toEqual([]);
    expect(fs.existsSync(path.join(clientPath, "todu-catalog.id"))).toBe(false);
    expect(await value(receiving.instance, "device.list")).toEqual(originalMembers);
    await joining.stop();
    await joining.start();
    expect(await value<EnrollmentClientStatus>(joining, "sync.enrollmentStatus")).toMatchObject({
      stage: "denied",
      deviceId: requested.deviceId,
    });
  });

  it("expires pending requests after source restart without sending any documents", async () => {
    const receiving = await source();
    const clientPath = prepare();
    const joining = runtime("client");
    await joining.start();
    const requested = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
      endpoint: receiving.endpoint,
    });
    await receiving.instance.stop();
    const journal = path.join(
      receiving.instance.config().storagePath,
      "todu-enrollment-requests.json",
    );
    const requests = JSON.parse(fs.readFileSync(journal, "utf-8")) as EnrollmentRequest[];
    requests[0].expiresAt = new Date(Date.now() - 1_000).toISOString();
    fs.writeFileSync(journal, JSON.stringify(requests));
    const restarted = runtime("source", {
      syncListener: { enabled: true, bind: "127.0.0.1", port: receiving.port },
    });
    await restarted.start();
    await vi.waitFor(
      async () =>
        expect(await value<EnrollmentClientStatus>(joining, "sync.enrollmentStatus")).toMatchObject(
          { stage: "expired", deviceId: requested.deviceId },
        ),
      { timeout: 5_000 },
    );
    expect(documentFiles(clientPath)).toEqual([]);
    expect(fs.existsSync(path.join(clientPath, "todu-catalog.id"))).toBe(false);
    expect(
      await rpc(restarted, "sync.enrollmentApprove", { requestId: requested.requestId }),
    ).toMatchObject({ ok: false });
  });

  it("rejects a bogus approved catalog before opening native replication or writing enrollment metadata", async () => {
    const receiving = await source();
    const joining = runtime("client");
    await joining.start();
    const originalCatalog = joining.status().catalogId;
    let upgrades = 0;
    const fake = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const registration = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
        requestId: string;
        device: { id: string };
      };
      const wrongCatalog = receiving.instance.status().catalogId!;
      response.end(
        JSON.stringify({
          requestId: registration.requestId,
          state: "approved",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          approval: {
            deviceId: registration.device.id,
            sourceDeviceId: "bogus-native-source",
            catalogId: wrongCatalog,
            syncPath: `/sync/${wrongCatalog}`,
          },
        }),
      );
    });
    fake.on("upgrade", (_request, socket) => {
      upgrades++;
      socket.destroy();
    });
    fake.listen(0, "127.0.0.1");
    await once(fake, "listening");
    const address = fake.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    try {
      expect(
        await rpc(joining, "sync.enroll", { endpoint: `http://127.0.0.1:${address.port}` }),
      ).toMatchObject({ ok: false });
      expect(upgrades).toBe(0);
      expect(joining.status().catalogId).toBe(originalCatalog);
      expect(fs.existsSync(path.join(joining.config().storagePath, "todu-enrollment.json"))).toBe(
        false,
      );
    } finally {
      await new Promise<void>((resolve) => fake.close(() => resolve()));
    }
  });

  it("recovers a lost initial response with stable native identity, one request, and one membership", async () => {
    const receiving = await source();
    prepare();
    const joining = runtime("client");
    await joining.start();
    const replica = readEnrollmentState(joining.config().storagePath)?.status.deviceId;
    const original = globalThis.fetch;
    let dropped = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
      const response = await original(...args);
      if (!dropped && args[1]?.method === "POST") {
        dropped = true;
        await response.text();
        throw new Error("Simulated response loss after server acceptance");
      }
      return response;
    });
    expect(await rpc(joining, "sync.enroll", { endpoint: receiving.endpoint })).toMatchObject({
      ok: false,
    });
    const request = (
      await value<EnrollmentRequest[]>(receiving.instance, "sync.enrollmentRequests")
    )[0];
    expect(request.device.id).toBe(replica);
    const retried = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
      endpoint: receiving.endpoint,
    });
    expect(retried.requestId).toBe(request.requestId);
    expect(retried.deviceId).toBe(replica);
    await value(receiving.instance, "sync.enrollmentApprove", { requestId: request.requestId });
    await active(joining, receiving.instance.status().catalogId!);
    expect(
      await value<EnrollmentRequest[]>(receiving.instance, "sync.enrollmentRequests"),
    ).toHaveLength(1);
    expect(
      (await value<Array<{ id: DeviceId }>>(receiving.instance, "device.list")).filter(
        (device) => device.id === replica,
      ),
    ).toHaveLength(1);
  });

  it("cancels and survives abandonment without deleting an already-approved roster entry", async () => {
    const receiving = await source();
    const clientPath = prepare();
    const joining = runtime("client");
    await joining.start();
    const requested = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
      endpoint: receiving.endpoint,
    });
    await value(joining, "sync.enrollmentCancel");
    await value(receiving.instance, "sync.enrollmentApprove", { requestId: requested.requestId });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(joining.status().catalogId).toBeUndefined();
    expect(documentFiles(clientPath)).toEqual([]);
    expect(await value<Array<{ id: DeviceId }>>(receiving.instance, "device.list")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: requested.deviceId })]),
    );
    await joining.stop();
    await joining.start();
    expect(await value<EnrollmentClientStatus>(joining, "sync.enrollmentStatus")).toMatchObject({
      stage: "cancelled",
      deviceId: requested.deviceId,
    });
    const retry = await value<EnrollmentClientStatus>(joining, "sync.enroll", {
      endpoint: receiving.endpoint,
    });
    expect(retry.stage).toBe("attaching");
    expect(retry.deviceId).toBe(requested.deviceId);
    await active(joining, receiving.instance.status().catalogId!);
    expect(await rpc(joining, "sync.enrollmentCancel")).toMatchObject({ ok: false });
  });
});
