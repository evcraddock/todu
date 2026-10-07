import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentId } from "@automerge/automerge-repo/slim";
import {
  WebSocketClientAdapter,
  WebSocketServerAdapter,
} from "@automerge/automerge-repo-network-websocket";
import {
  type CatalogDocument,
  createDeviceId,
  deviceRegistryKey,
  getDeviceRegistryEntries,
  type Result,
} from "@todu/core";
import type { WebSocketServer as IsoWebSocketServer } from "isomorphic-ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createDeviceNamespace, registerApprovedDevice } from "./devices.js";
import { createTodu } from "./index.js";
import {
  createPersistentRepo,
  initBootstrapStorage,
  initJoinStorage,
  type Storage,
} from "./storage.js";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe("dataset device registry", () => {
  let directory: string;
  const storages: Storage[] = [];
  const servers: WebSocketServer[] = [];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-devices-"));
  });

  afterEach(async () => {
    await Promise.all(storages.splice(0).map((storage) => storage.close()));
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
    );
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function open(name: string): Promise<Storage> {
    const storage = await initBootstrapStorage(path.join(directory, name));
    storages.push(storage);
    return storage;
  }

  it("automatically uses the persistent native storage ID and preserves identity on restart", async () => {
    const storage = await open("local");
    const id = createDeviceId((await storage.repo.storageId())!);
    const catalogId = storage.catalog.documentId;
    const devices = createDeviceNamespace({ catalog: storage.catalog, localDeviceId: id });
    expect(unwrap(await devices.list())).toEqual([{ id, name: os.hostname() }]);
    unwrap(await devices.rename(id, "Laptop"));
    unwrap(await devices.setEndpoint(id, "http://laptop.lan:24377"));
    await storage.close();
    storages.splice(storages.indexOf(storage), 1);
    const reopened = await open("local");
    expect(reopened.catalog.documentId).toBe(catalogId);
    expect(await reopened.repo.storageId()).toBe(id);
    expect(reopened.catalog.doc()![deviceRegistryKey(id)]).toEqual({
      id,
      name: "Laptop",
      endpoint: "http://laptop.lan:24377",
    });
    expect(fs.existsSync(path.join(directory, "local", "accounts"))).toBe(false);
  });

  it("publishes an approved endpoint for an existing endpoint-less entry without replacing its name or later explicit endpoint", async () => {
    const storage = await open("local");
    const id = createDeviceId("existing-registered-id");
    storage.catalog.change((doc) => {
      doc[deviceRegistryKey(id)] = { id, name: "Existing name" };
    });
    const approved = unwrap(
      await registerApprovedDevice({
        catalog: storage.catalog,
        repo: storage.repo,
        device: { id, name: "Request name", endpoint: "http://laptop.lan:24377" },
      }),
    );
    expect(approved).toEqual({ id, name: "Existing name", endpoint: "http://laptop.lan:24377" });
    expect(storage.catalog.doc()![deviceRegistryKey(id)]).toEqual(approved);
    const repeated = unwrap(
      await registerApprovedDevice({
        catalog: storage.catalog,
        repo: storage.repo,
        device: { id, name: "Another name", endpoint: "http://other.lan:24377" },
      }),
    );
    expect(repeated).toEqual(approved);
  });
  it("initializes an existing catalog idempotently without changing its data or IDs", async () => {
    const storage = await open("legacy");
    const id = createDeviceId((await storage.repo.storageId())!);
    const catalogId = storage.catalog.documentId;
    storage.catalog.change((doc) => {
      delete doc[deviceRegistryKey(id)];
    });
    await storage.repo.storageSubsystem!.remove("todu-device-registry", catalogId);
    const settings = structuredClone(storage.catalog.doc()!.settings);
    await storage.close();
    storages.splice(storages.indexOf(storage), 1);
    const reopened = await open("legacy");
    expect(reopened.catalog.documentId).toBe(catalogId);
    expect(await reopened.repo.storageId()).toBe(id);
    expect(reopened.catalog.doc()!.settings).toEqual(settings);
    expect(getDeviceRegistryEntries(reopened.catalog.doc()!).map((device) => device.id)).toEqual([
      id,
    ]);
  });

  it("keeps observed removal removed after restart", async () => {
    const storage = await open("removed");
    const id = createDeviceId((await storage.repo.storageId())!);
    const devices = createDeviceNamespace({ catalog: storage.catalog, localDeviceId: id });
    unwrap(await devices.remove(id));
    expect(unwrap(await devices.list())).toEqual([]);
    expect((await devices.rename(id, "Back")).ok).toBe(false);
    await storage.repo.storageSubsystem!.remove("todu-device-registry", storage.catalog.documentId);
    await storage.close();
    storages.splice(storages.indexOf(storage), 1);
    const reopened = await open("removed");
    expect(reopened.catalog.doc()![deviceRegistryKey(id)].removed).toBe(true);
  });

  it("replicates independent field edits and removal between established same-dataset replicas", async () => {
    const first = await open("first");
    const id = createDeviceId((await first.repo.storageId())!);
    const catalogId = first.catalog.documentId;
    const secondPath = path.join(directory, "second");
    const repo = createPersistentRepo(secondPath);
    const binary = await first.repo.export(catalogId);
    if (!binary) throw new Error("Missing catalog export");
    repo.import<CatalogDocument>(binary, { docId: catalogId });
    await repo.flush();
    fs.writeFileSync(path.join(secondPath, "todu-catalog.id"), catalogId);
    const second = await initBootstrapStorage(secondPath, repo);
    storages.push(second);
    const secondId = createDeviceId((await repo.storageId())!);
    const a = createDeviceNamespace({ catalog: first.catalog, localDeviceId: id });
    const b = createDeviceNamespace({ catalog: second.catalog, localDeviceId: secondId });
    unwrap(await a.rename(id, "Desktop"));
    unwrap(await b.setEndpoint(id, "http://desktop.lan:24377"));
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing listener address");
    first.repo.networkSubsystem.addNetworkAdapter(
      new WebSocketServerAdapter(server as unknown as IsoWebSocketServer),
    );
    second.repo.networkSubsystem.addNetworkAdapter(
      new WebSocketClientAdapter(`ws://127.0.0.1:${address.port}`),
    );
    await expect
      .poll(() => first.catalog.doc()![deviceRegistryKey(id)].endpoint)
      .toBe("http://desktop.lan:24377");
    await expect.poll(() => second.catalog.doc()![deviceRegistryKey(id)].name).toBe("Desktop");
    await expect.poll(() => getDeviceRegistryEntries(first.catalog.doc()!)).toHaveLength(2);
    unwrap(await b.remove(id));
    await expect.poll(() => unwrapList(a)).toEqual([{ id: secondId, name: os.hostname() }]);
    await second.close();
    storages.splice(storages.indexOf(second), 1);
    const reopened = await open("second");
    expect(reopened.catalog.doc()![deviceRegistryKey(id)].removed).toBe(true);
    expect(reopened.catalog.doc()![deviceRegistryKey(secondId)].id).toBe(secondId);
  });

  it("preserves both memberships when legacy replicas initialize independently while offline", async () => {
    const first = await open("legacy-first");
    const catalogId = first.catalog.documentId;
    const firstId = createDeviceId((await first.repo.storageId())!);
    first.catalog.change((doc) => {
      delete doc[deviceRegistryKey(firstId)];
    });
    await first.repo.storageSubsystem!.remove("todu-device-registry", catalogId);
    const binary = await first.repo.export(catalogId);
    if (!binary) throw new Error("Missing catalog export");
    await first.close();
    storages.splice(storages.indexOf(first), 1);
    const secondPath = path.join(directory, "legacy-second");
    const repo = createPersistentRepo(secondPath);
    repo.import<CatalogDocument>(binary, { docId: catalogId });
    await repo.flush();
    fs.writeFileSync(path.join(secondPath, "todu-catalog.id"), catalogId);
    const second = await initBootstrapStorage(secondPath, repo);
    storages.push(second);
    const reopened = await open("legacy-first");
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing listener address");
    reopened.repo.networkSubsystem.addNetworkAdapter(
      new WebSocketServerAdapter(server as unknown as IsoWebSocketServer),
    );
    second.repo.networkSubsystem.addNetworkAdapter(
      new WebSocketClientAdapter(`ws://127.0.0.1:${address.port}`),
    );
    await expect.poll(() => getDeviceRegistryEntries(reopened.catalog.doc()!)).toHaveLength(2);
    await expect.poll(() => getDeviceRegistryEntries(second.catalog.doc()!)).toHaveLength(2);
  });

  it("pending join validation neither enrolls nor mutates the target or another dataset", async () => {
    const source = await open("source");
    const other = await open("destination");
    const original = structuredClone(other.catalog.doc()!);
    const originalId = other.catalog.documentId;
    const sourceBefore = structuredClone(source.catalog.doc()!);
    const targetId = source.catalog.documentId;
    const pendingRepo = createPersistentRepo(path.join(directory, "destination"));
    const binary = await source.repo.export(targetId);
    if (!binary) throw new Error("Missing catalog export");
    pendingRepo.import<CatalogDocument>(binary, { docId: targetId });
    const pending = await initJoinStorage(
      path.join(directory, "destination"),
      targetId,
      pendingRepo,
    );
    storages.push(pending);
    expect(pending.catalog.doc()).toEqual(sourceBefore);
    expect(other.catalog.doc()).toEqual(original);
    expect(fs.readFileSync(path.join(directory, "destination", "todu-catalog.id"), "utf8")).toBe(
      originalId,
    );
    expect(
      pending.catalog.doc()![deviceRegistryKey(createDeviceId((await pendingRepo.storageId())!))],
    ).toBeUndefined();
  });

  it("does not turn persisted pending storage into membership on subsequent bootstrap", async () => {
    const source = await open("source");
    const pendingPath = path.join(directory, "pending");
    const repo = createPersistentRepo(pendingPath);
    const catalogId = source.catalog.documentId;
    const binary = await source.repo.export(catalogId);
    if (!binary) throw new Error("Missing catalog export");
    repo.import<CatalogDocument>(binary, { docId: catalogId });
    const pending = await initJoinStorage(pendingPath, catalogId as DocumentId, repo);
    const pendingId = (await repo.storageId())!;
    await pending.close();
    fs.writeFileSync(path.join(pendingPath, "todu-catalog.id"), catalogId);
    const reopened = await open("pending");
    expect(reopened.catalog.doc()![deviceRegistryKey(createDeviceId(pendingId))]).toBeUndefined();
  });

  it("metadata edits cannot enable a listener or alter server and automation settings", async () => {
    const todu = await createTodu({ storagePath: path.join(directory, "sdk") });
    try {
      const beforeConfig = todu.config.get();
      const beforeStatus = structuredClone(todu.sync.status());
      const id = unwrap(await todu.device.localId());
      unwrap(await todu.device.rename(id, "Listener metadata only"));
      unwrap(await todu.device.setEndpoint(id, "http://0.0.0.0:24377"));
      expect(todu.config.get()).toEqual(beforeConfig);
      expect(todu.sync.status()).toEqual(beforeStatus);
      expect(todu.sync.status().local.mode).toBe("standalone");
      unwrap(await todu.device.setEndpoint(id, null));
      expect(unwrap(await todu.device.list())[0].endpoint).toBeUndefined();
      expect((await todu.device.rename(createDeviceId("unknown"), "Unknown")).ok).toBe(false);
      expect((await todu.device.setEndpoint(id, "ws://host:24377/sync/catalog")).ok).toBe(false);
    } finally {
      await todu.close();
    }
  });
});

async function unwrapList(devices: ReturnType<typeof createDeviceNamespace>) {
  return unwrap(await devices.list());
}
