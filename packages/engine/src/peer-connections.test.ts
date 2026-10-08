import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import {
  type CatalogDocument,
  createDeviceId,
  createEmptyCatalog,
  type DeviceRegistryEntry,
  deviceRegistryKey,
} from "@todu/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEnrollmentPeerConnection,
  type EnrollmentPeerConnection,
  type EnrollmentSource,
} from "./enrollment-peer.js";
import { createRosterPeerConnections } from "./peer-connections.js";

vi.mock("./enrollment-peer.js", () => ({
  createEnrollmentPeerConnection: vi.fn((options: { source: EnrollmentSource }) => ({
    source: options.source,
    ready: vi.fn(async () => {}),
    close: vi.fn(),
  })),
  enrollmentSyncUrl: (source: EnrollmentSource) => {
    const url = new URL(source.approval.syncPath, source.endpoint);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  },
}));
const localId = createDeviceId("local");
const peer = (endpoint = "http://peer.lan:24377"): DeviceRegistryEntry => ({
  id: createDeviceId("peer"),
  name: "Peer",
  endpoint,
});
function setup() {
  const doc = createEmptyCatalog();
  const catalog = {
    documentId: "catalog",
    doc: () => doc,
  } as unknown as DocHandle<CatalogDocument>;
  const existing = vi.fn<(source: EnrollmentSource) => EnrollmentPeerConnection | undefined>();
  const manager = createRosterPeerConnections({ catalog, repo: {} as Repo, localId, existing });
  const put = (device: DeviceRegistryEntry) => {
    doc[deviceRegistryKey(device.id)] = device;
  };
  return { doc, manager, put, existing };
}

describe("explicit roster snapshots", () => {
  beforeEach(() => {
    vi.mocked(createEnrollmentPeerConnection).mockClear();
  });
  it("excludes self, removed and endpoint-less entries; uses the current catalog route", () => {
    const { manager, put } = setup();
    put({ id: localId, name: "Self", endpoint: "http://self.lan:24377" });
    put({
      id: createDeviceId("removed"),
      name: "Removed",
      endpoint: "http://removed.lan",
      removed: true,
    });
    put({ id: createDeviceId("legacy"), name: "Legacy" });
    put(peer());
    expect(manager.reload()).toMatchObject({
      ok: true,
      value: { added: 1, retained: 0, removed: 0 },
    });
    expect(createEnrollmentPeerConnection).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: {
          endpoint: "http://peer.lan:24377",
          approval: {
            catalogId: "catalog",
            deviceId: localId,
            sourceDeviceId: createDeviceId("peer"),
            syncPath: "/sync/catalog",
          },
        },
      }),
    );
  });
  it("does not watch the roster; refresh is explicit and idempotent", () => {
    const { manager, put } = setup();
    manager.reload();
    put(peer());
    expect(createEnrollmentPeerConnection).not.toHaveBeenCalled();
    manager.reload();
    const link = manager.find({
      endpoint: peer().endpoint!,
      approval: {
        catalogId: "catalog",
        deviceId: localId,
        sourceDeviceId: createDeviceId("peer"),
        syncPath: "/sync/catalog",
      },
    });
    expect(link).toBeDefined();
    expect(manager.reload()).toMatchObject({ ok: true, value: { retained: 1, added: 0 } });
    expect(createEnrollmentPeerConnection).toHaveBeenCalledTimes(1);
    put({ ...peer(), removed: true });
    expect(link?.close).not.toHaveBeenCalled();
    expect(manager.reload()).toMatchObject({ ok: true, value: { removed: 1 } });
    expect(link?.close).toHaveBeenCalledTimes(1);
  });
  it("disposes a changed endpoint before attaching its replacement", () => {
    const { manager, put } = setup();
    put(peer());
    manager.reload();
    const first = vi.mocked(createEnrollmentPeerConnection).mock.results[0]
      .value as EnrollmentPeerConnection;
    put(peer("https://new-peer.lan"));
    manager.reload();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(createEnrollmentPeerConnection).toHaveBeenCalledTimes(2);
    expect(vi.mocked(first.close).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createEnrollmentPeerConnection).mock.invocationCallOrder[1],
    );
  });
  it("reuses an existing source and does not wait for transport readiness", () => {
    const { manager, put, existing } = setup();
    const link = {
      source: {} as EnrollmentSource,
      ready: vi.fn(() => new Promise<void>(() => {})),
      close: vi.fn(),
    };
    existing.mockReturnValue(link);
    put(peer());
    expect(manager.reload()).toMatchObject({ ok: true, value: { retained: 1 } });
    expect(createEnrollmentPeerConnection).not.toHaveBeenCalled();
    expect(link.ready).not.toHaveBeenCalled();
    manager.close();
    expect(link.close).toHaveBeenCalledOnce();
  });
  it("isolates invalid metadata/attachment failures while attaching other targets", () => {
    const { manager, put } = setup();
    put(peer("http://user:secret@peer.lan"));
    put({ id: createDeviceId("good"), name: "Good", endpoint: "http://good.lan" });
    expect(manager.reload()).toMatchObject({
      ok: true,
      value: { added: 1, errors: [expect.stringContaining("peer")] },
    });
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    expect(JSON.stringify(manager.reload())).not.toContain("secret");
  });
  it("hands off only cached server-backed roles without rereading roster edits or touching other peers", async () => {
    const { manager, put, existing } = setup();
    const borrowed = {
      source: {} as EnrollmentSource,
      serverBacked: true,
      ready: vi.fn(async () => {}),
      close: vi.fn(),
    };
    existing.mockImplementation((source) =>
      source.approval.sourceDeviceId === peer().id ? borrowed : undefined,
    );
    put(peer());
    put({ id: createDeviceId("other"), name: "Other", endpoint: "http://other.lan:24377" });
    manager.reload();
    const other = vi.mocked(createEnrollmentPeerConnection).mock.results[0].value;
    put({ id: createDeviceId("new"), name: "Not refreshed", endpoint: "http://new.lan" });
    const url = "ws://peer.lan:24377/sync/catalog";
    const promoted = {
      source: manager.serverSources(url)[0],
      ready: vi.fn(async () => {}),
      close: vi.fn(),
    };
    expect(manager.adoptServer(url, promoted)).toBe(true);
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    expect(other.close).not.toHaveBeenCalled();
    expect(borrowed.close).toHaveBeenCalledOnce();
    expect(manager.adoptServer(url, promoted)).toBe(false);
    expect(createEnrollmentPeerConnection).toHaveBeenCalledOnce();
    manager.close();
    expect(other.close).toHaveBeenCalledOnce();
    expect(promoted.close).toHaveBeenCalledOnce();
  });
  it("keeps the borrowed role available when adoption identifies a different source", async () => {
    const { manager, put, existing } = setup();
    const borrowed = {
      source: {} as EnrollmentSource,
      serverBacked: true,
      ready: vi.fn(async () => {}),
      close: vi.fn(),
    };
    existing.mockReturnValue(borrowed);
    put(peer());
    manager.reload();
    const replacement = {
      source: {
        ...manager.serverSources("ws://peer.lan:24377/sync/catalog")[0],
        approval: {
          ...manager.serverSources("ws://peer.lan:24377/sync/catalog")[0].approval,
          sourceDeviceId: createDeviceId("different"),
        },
      },
      ready: vi.fn(async () => {}),
      close: vi.fn(),
    };
    expect(() => manager.adoptServer("ws://peer.lan:24377/sync/catalog", replacement)).toThrow(
      "different native source identity",
    );
    expect(borrowed.close).not.toHaveBeenCalled();
    expect(replacement.close).not.toHaveBeenCalled();
    expect(manager.reload()).toMatchObject({ ok: true, value: { retained: 1 } });
    manager.close();
  });
  it("closes owned links once and refuses reload after close", () => {
    const { manager, put } = setup();
    put(peer());
    manager.reload();
    const link = vi.mocked(createEnrollmentPeerConnection).mock.results[0]
      .value as EnrollmentPeerConnection;
    manager.close();
    manager.close();
    expect(link.close).toHaveBeenCalledOnce();
    expect(manager.reload()).toMatchObject({ ok: false });
  });
});
