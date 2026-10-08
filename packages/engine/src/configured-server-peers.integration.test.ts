import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Repo } from "@automerge/automerge-repo/slim";
import type { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { createDeviceId, deviceRegistryKey } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrollmentPeerConnection } from "./enrollment-peer.js";
import { createTodu } from "./index.js";
import { initBootstrapStorage } from "./storage.js";
import { addRemoteSyncAdapter } from "./sync-client.js";
import type { Todu } from "./todu.js";

class Adapter extends EventEmitter {
  remotePeerId: string | undefined = "fixture-routing-id";
  socket = { OPEN: 1, readyState: 1 };
  constructor(public url: string) {
    super();
  }
  disconnect() {
    this.remotePeerId = undefined;
    this.socket.readyState = 3;
  }
}
vi.mock("./sync-client.js", async (original) => ({
  ...(await original<typeof import("./sync-client.js")>()),
  addRemoteSyncAdapter: vi.fn(
    (_repo: Repo, url: string) => new Adapter(url) as unknown as WebSocketClientAdapter,
  ),
  disposeRemoteSyncAdapter: vi.fn((_repo: Repo, adapter: WebSocketClientAdapter) => {
    adapter.disconnect();
    adapter.removeAllListeners();
  }),
}));
vi.mock("./enrollment-peer.js", async (original) => ({
  ...(await original<typeof import("./enrollment-peer.js")>()),
  createEnrollmentPeerConnection: vi.fn(
    (options: { source: import("./enrollment-peer.js").EnrollmentSource }) => {
      let closed = false;
      return {
        source: options.source,
        ready: vi.fn(async () => {}),
        close: vi.fn(() => {
          closed = true;
        }),
        isClosed: () => closed,
      };
    },
  ),
}));

/** One persistent local engine with mocked transports; this is not device-exchange evidence. */
describe("configured server and cached peer role independence", () => {
  let directory: string;
  let todu: Todu | undefined;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-server-peer-role-"));
    vi.mocked(createEnrollmentPeerConnection).mockClear();
    vi.mocked(addRemoteSyncAdapter).mockClear();
  });
  afterEach(async () => {
    await todu?.close();
    todu = undefined;
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true });
  });
  async function open() {
    const storage = await initBootstrapStorage(directory);
    const catalogId = storage.catalog.documentId;
    const peer = createDeviceId("fixture-peer");
    const endpoint = "http://127.0.0.1:1";
    storage.catalog.change((doc) => {
      doc[deviceRegistryKey(peer)] = { id: peer, name: "Fixture", endpoint };
    });
    await storage.close();
    todu = await createTodu({
      storagePath: directory,
      registeredPeerConnections: true,
      remoteSync: { server: `ws://127.0.0.1:1/sync/${catalogId}` },
    });
    expect(await todu.sync.reloadPeers()).toMatchObject({
      ok: true,
      value: { retained: 1, added: 0 },
    });
    expect(createEnrollmentPeerConnection).not.toHaveBeenCalled();
    return { adapter: vi.mocked(addRemoteSyncAdapter).mock.results[0].value, catalogId };
  }
  it.each([
    "stop",
    "disable",
    "repoint",
  ])("preserves a borrowed peer across %s using the actual engine boundary", async (action) => {
    const { adapter, catalogId } = await open();
    if (action === "stop") await todu!.sync.stop();
    else
      expect(
        (
          await todu!.sync.configureServer(
            action === "disable" ? { enabled: false } : { server: "ws://127.0.0.1:2" },
          )
        ).ok,
      ).toBe(true);
    expect(adapter.socket?.readyState).toBe(3);
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    const direct = vi.mocked(createEnrollmentPeerConnection).mock.results[0].value;
    expect(direct.ready).toHaveBeenCalledOnce();
    expect(direct.close).not.toHaveBeenCalled();
    expect(await todu!.sync.reloadPeers()).toMatchObject({
      ok: true,
      value: { retained: 1, added: 0, removed: 0 },
    });
    expect(todu!.sync.getCatalogId()).toBe(catalogId);
    await todu!.sync.start();
    expect(direct.close).not.toHaveBeenCalled();
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    await todu!.close();
    todu = undefined;
    expect(direct.close).toHaveBeenCalledOnce();
  });
  it("restores prior server intent if replacement adapter creation fails while keeping its promoted peer", async () => {
    await open();
    const before = todu!.sync.serverStatus();
    vi.mocked(addRemoteSyncAdapter).mockImplementationOnce(() => {
      throw new Error("Simulated adapter creation failure");
    });
    expect(await todu!.sync.configureServer({ server: "ws://127.0.0.1:2" })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Simulated adapter creation failure") },
    });
    expect(todu!.sync.serverStatus()).toEqual(before);
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    expect(await todu!.sync.reloadPeers()).toMatchObject({
      ok: true,
      value: { retained: 1, added: 0 },
    });
  });
  it.each([
    { enabled: false, managed: true },
    { enabled: false, managed: false },
    { enabled: true, managed: false },
  ])("preserves the same-address approved source for server/roster roles $enabled/$managed", async ({
    enabled,
    managed,
  }) => {
    const storage = await initBootstrapStorage(directory);
    const catalogId = storage.catalog.documentId;
    const deviceId = createDeviceId((await storage.repo.storageId())!);
    const sourceDeviceId = createDeviceId("fixture-source");
    const endpoint = "http://127.0.0.1:1";
    storage.catalog.change((doc) => {
      doc[deviceRegistryKey(sourceDeviceId)] = { id: sourceDeviceId, name: "Source", endpoint };
    });
    await storage.close();
    const source = {
      endpoint,
      approval: { catalogId, deviceId, sourceDeviceId, syncPath: `/sync/${catalogId}` },
    };
    todu = await createTodu({
      storagePath: directory,
      registeredPeerConnections: managed,
      remoteSyncSettings: { server: `ws://127.0.0.1:1/sync/${catalogId}`, enabled },
      enrollmentSource: source,
    });
    expect(addRemoteSyncAdapter).toHaveBeenCalledTimes(enabled ? 1 : 0);
    expect(createEnrollmentPeerConnection).toHaveBeenCalledTimes(enabled ? 0 : 1);
    await todu.sync.stop();
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    if (managed)
      expect(await todu.sync.reloadPeers()).toMatchObject({
        ok: true,
        value: { retained: 1, added: 0 },
      });
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    expect(
      vi.mocked(createEnrollmentPeerConnection).mock.results[0].value.close,
    ).not.toHaveBeenCalled();
    expect(todu.sync.serverStatus()).toMatchObject({ enabled, running: false });
    if (managed) {
      expect((await todu.device.remove(sourceDeviceId)).ok).toBe(true);
      expect(await todu.sync.reloadPeers()).toMatchObject({ ok: true, value: { removed: 1 } });
      await todu.sync.start();
      await todu.sync.stop();
      expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
      expect(
        vi.mocked(createEnrollmentPeerConnection).mock.results[0].value.close,
      ).toHaveBeenCalledOnce();
    }
  });
  it("promotes a cached peer after server connection loss without a roster refresh", async () => {
    const { adapter } = await open();
    adapter.remotePeerId = undefined;
    (adapter.socket as unknown as Adapter["socket"]).readyState = 3;
    adapter.emit("peer-disconnected", { peerId: "fixture-routing-id" });
    await expect.poll(() => vi.mocked(createEnrollmentPeerConnection).mock.calls.length).toBe(1);
    expect(
      vi.mocked(createEnrollmentPeerConnection).mock.results[0].value.close,
    ).not.toHaveBeenCalled();
  });
});
