import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import { type CatalogDocument, createDeviceId, deviceRegistryKey } from "@todu/core";
import { prepareEnrollmentStorage } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invokeDaemonMethod } from "../../cli/src/daemon-transport.js";
import {
  createEnrollmentPeerConnection,
  type EnrollmentSource,
} from "../../engine/src/enrollment-peer.js";
import * as engine from "../../engine/src/index.js";
import * as storage from "../../engine/src/storage.js";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";

vi.mock("../../engine/src/enrollment-peer.js", async (original) => ({
  ...(await original<typeof import("../../engine/src/enrollment-peer.js")>()),
  createEnrollmentPeerConnection: vi.fn((options: { source: EnrollmentSource }) => {
    let closed = false;
    return {
      source: options.source,
      ready: vi.fn(async () => {}),
      close: vi.fn(() => {
        closed = true;
      }),
      isClosed: () => closed,
    };
  }),
}));

/** One real local daemon; peer adapters are mocked and never contact remote devices. */
describe("daemon roster snapshots and private reload", () => {
  let directory: string;
  let runtime: DaemonRuntime | undefined;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-roster-wiring-"));
    vi.mocked(createEnrollmentPeerConnection).mockClear();
  });
  afterEach(async () => {
    await runtime?.stop();
    runtime = undefined;
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true });
  });
  const id = createDeviceId("fixture-peer");
  const second = createDeviceId("fixture-peer-two");
  function rpc() {
    return invokeDaemonMethod({
      socketPath: runtime!.config().socketPath,
      method: "sync.peersReload",
      params: {},
    });
  }
  it("loads persisted targets at startup and changes them only on explicit reload", async () => {
    const initial = await storage.initBootstrapStorage(directory);
    initial.catalog.change((doc) => {
      doc[deviceRegistryKey(id)] = { id, name: "Fixture", endpoint: "http://peer.invalid:24377" };
    });
    await initial.close();
    let repo: Repo | undefined;
    const create = storage.createPersistentRepo;
    vi.spyOn(storage, "createPersistentRepo").mockImplementation((...args) => {
      repo = create(...args);
      return repo;
    });
    runtime = createDaemonRuntime({
      storagePath: directory,
      assignedWorkerTypes: [],
      logLevel: "error",
    });
    await runtime.start();
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    expect(createEnrollmentPeerConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          endpoint: "http://peer.invalid:24377",
          approval: expect.objectContaining({ syncPath: `/sync/${runtime.status().catalogId}` }),
        }),
      }),
    );
    const config = runtime.config();
    const catalog = await repo!.find<CatalogDocument>(
      runtime.status().catalogId as DocHandle<CatalogDocument>["documentId"],
    );
    catalog.change((doc) => {
      doc[deviceRegistryKey(second)] = {
        id: second,
        name: "Second fixture",
        endpoint: "http://second.invalid:24377",
      };
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    expect(await rpc()).toMatchObject({ ok: true, value: { added: 1, retained: 1, removed: 0 } });
    const firstLink = vi.mocked(createEnrollmentPeerConnection).mock.results[0].value;
    catalog.change((doc) => {
      doc[deviceRegistryKey(id)].endpoint = "http://changed.invalid:24377";
    });
    expect(firstLink.close).not.toHaveBeenCalled();
    expect(await rpc()).toMatchObject({ ok: true, value: { added: 1, retained: 1, removed: 1 } });
    expect(firstLink.close).toHaveBeenCalledOnce();
    expect(await rpc()).toMatchObject({ ok: true, value: { added: 0, retained: 2, removed: 0 } });
    expect(createEnrollmentPeerConnection).toHaveBeenCalledTimes(3);
    catalog.change((doc) => {
      doc[deviceRegistryKey(second)].removed = true;
    });
    expect(await rpc()).toMatchObject({ ok: true, value: { added: 0, retained: 1, removed: 1 } });
    expect(runtime.config()).toEqual(config);
    await runtime.stop();
    for (const result of vi.mocked(createEnrollmentPeerConnection).mock.results)
      expect(result.value.close).toHaveBeenCalledOnce();
  });
  it.each([
    "removal",
    "retarget",
  ])("does not alias different identities at one URL or close the unchanged source on %s", async (change) => {
    let host: engine.ToduWithInternalTools | undefined;
    const create = engine.createTodu;
    vi.spyOn(engine, "createTodu").mockImplementation(async (...args) => {
      const instance = await create(...args);
      host = instance as engine.ToduWithInternalTools;
      return instance;
    });
    runtime = createDaemonRuntime({
      storagePath: directory,
      assignedWorkerTypes: [],
      logLevel: "error",
    });
    await runtime.start();
    const endpoint = "http://shared-address.invalid:24377";
    for (const device of [id, second]) {
      expect(
        await host!.__internal.enrollment.registerDevice({ id: device, name: device, endpoint }),
      ).toMatchObject({ ok: true });
    }
    const local = await host!.device.localId();
    if (!local.ok) throw new Error(local.error.message);
    const source: EnrollmentSource = {
      endpoint,
      approval: {
        catalogId: runtime.status().catalogId!,
        deviceId: local.value,
        sourceDeviceId: id,
        syncPath: `/sync/${runtime.status().catalogId}`,
      },
    };
    expect(await host!.__internal.enrollment.attachSource(source)).toMatchObject({ ok: true });
    const original = vi.mocked(createEnrollmentPeerConnection).mock.results[0].value;
    expect(await rpc()).toMatchObject({ ok: true, value: { retained: 1, added: 1, removed: 0 } });
    expect(createEnrollmentPeerConnection).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(createEnrollmentPeerConnection).mock.results[1].value.source.approval
        .sourceDeviceId,
    ).toBe(second);
    expect(
      await (change === "removal"
        ? host!.device.remove(second)
        : host!.device.setEndpoint(second, "http://changed-address.invalid:24377")),
    ).toMatchObject({ ok: true });
    expect(await rpc()).toMatchObject({
      ok: true,
      value: { retained: 1, added: change === "removal" ? 0 : 1, removed: 1 },
    });
    expect(original.close).not.toHaveBeenCalled();
    expect(await host!.__internal.enrollment.attachSource(source)).toMatchObject({ ok: true });
    expect(original.ready).toHaveBeenCalledTimes(2);
    expect(createEnrollmentPeerConnection).toHaveBeenCalledTimes(change === "removal" ? 2 : 3);
    await runtime.stop();
    for (const result of vi.mocked(createEnrollmentPeerConnection).mock.results)
      expect(result.value.close).toHaveBeenCalledOnce();
  });
  it("persists server controls over private RPC without disposing direct peers, and retains disabled settings on restart", async () => {
    const configPath = path.join(directory, "config.yaml");
    const settings = { server: "ws://127.0.0.1:1", enabled: false };
    fs.writeFileSync(
      configPath,
      "# Keep local settings\nsync:\n  remote:\n    server: ws://127.0.0.1:1\n    enabled: false\n",
    );
    const initial = await storage.initBootstrapStorage(directory);
    initial.catalog.change((doc) => {
      doc[deviceRegistryKey(id)] = { id, name: "Fixture", endpoint: "http://peer.invalid:24377" };
    });
    const catalogId = initial.catalog.documentId;
    await initial.close();
    runtime = createDaemonRuntime({
      storagePath: directory,
      configPath,
      remoteSyncSettings: settings,
      assignedWorkerTypes: [],
      logLevel: "error",
    });
    await runtime.start();
    const peer = vi.mocked(createEnrollmentPeerConnection).mock.results[0].value;
    const invoke = (update?: Record<string, unknown>) =>
      invokeDaemonMethod({
        socketPath: runtime!.config().socketPath,
        method: update ? "sync.serverConfigure" : "sync.serverStatus",
        params: update ? { settings: update, configPath } : {},
      });
    expect(await invoke()).toMatchObject({
      ok: true,
      value: { server: settings.server, enabled: false, running: false },
    });
    expect(await invoke({ enabled: true })).toMatchObject({
      ok: true,
      value: { enabled: true, running: true },
    });
    expect(await invoke({ server: "ws://127.0.0.1:2" })).toMatchObject({
      ok: true,
      value: { server: "ws://127.0.0.1:2" },
    });
    expect(await invoke({ enabled: false })).toMatchObject({
      ok: true,
      value: { enabled: false, running: false },
    });
    expect(peer.close).not.toHaveBeenCalled();
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    expect(runtime.status().catalogId).toBe(catalogId);
    expect(runtime.config().remoteSyncSettings).toEqual({
      server: "ws://127.0.0.1:2",
      enabled: false,
    });
    expect(fs.readFileSync(configPath, "utf8")).toContain("# Keep local settings");
    await runtime.stop();
    runtime = createDaemonRuntime({
      storagePath: directory,
      configPath,
      remoteSyncSettings: runtime.config().remoteSyncSettings,
      assignedWorkerTypes: [],
      logLevel: "error",
    });
    await runtime.start();
    expect(await invoke()).toMatchObject({
      ok: true,
      value: { server: "ws://127.0.0.1:2", enabled: false, running: false },
    });
    expect(runtime.status().catalogId).toBe(catalogId);
    expect(await rpc()).toMatchObject({ ok: true, value: { retained: 1, added: 0 } });
  });
  it("does not attach roster adapters or create a dataset during pristine pending startup", async () => {
    expect(prepareEnrollmentStorage({ storagePath: directory }).ok).toBe(true);
    runtime = createDaemonRuntime({
      storagePath: directory,
      assignedWorkerTypes: [],
      logLevel: "error",
    });
    await runtime.start();
    expect(createEnrollmentPeerConnection).not.toHaveBeenCalled();
    expect(await rpc()).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
    expect(fs.existsSync(path.join(directory, "todu-catalog.id"))).toBe(false);
  });
});
