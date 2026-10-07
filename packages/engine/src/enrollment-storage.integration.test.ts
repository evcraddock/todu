import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NetworkAdapter, type PeerId, type PeerMetadata } from "@automerge/automerge-repo/slim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

class IdentityObserver extends NetworkAdapter {
  private complete!: () => void;
  private ready = new Promise<void>((resolve) => {
    this.complete = resolve;
  });
  isReady() {
    return this.peerMetadata !== undefined;
  }
  whenReady() {
    return this.ready;
  }
  connect(_peerId: PeerId, metadata?: PeerMetadata) {
    this.peerMetadata = metadata;
    this.complete();
  }
  send() {}
  disconnect() {}
}

import {
  openPendingEnrollmentStorage,
  prepareEnrollmentStorage,
  readEnrollmentState,
  writeEnrollmentState,
} from "./enrollment-storage.js";
import { createTodu } from "./index.js";
import { createPersistentRepo, initBootstrapStorage, shutdownPersistentRepo } from "./storage.js";

describe("pristine enrollment storage", () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-pending-storage-"));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true });
  });

  it("serializes native first-use identity reads with the identity announced by the constructor", async () => {
    const repo = createPersistentRepo(directory);
    try {
      const observer = new IdentityObserver();
      repo.networkSubsystem.addNetworkAdapter(observer);
      const ids = await Promise.all(Array.from({ length: 20 }, () => repo.storageId()));
      await observer.whenReady();
      expect(new Set(ids)).toEqual(new Set([observer.peerMetadata?.storageId]));
      expect(await repo.storageId()).toBe(observer.peerMetadata?.storageId);
      repo.networkSubsystem.removeNetworkAdapter(observer);
    } finally {
      await shutdownPersistentRepo(repo);
    }
  });

  it("prepares before bootstrap without creating a catalog or substitute dataset", async () => {
    expect(prepareEnrollmentStorage({ storagePath: directory })).toEqual({
      ok: true,
      value: { stage: "prepared" },
    });
    expect(fs.readdirSync(directory)).toEqual(["todu-enrollment.json"]);
    await expect(initBootstrapStorage(directory)).rejects.toThrow("ordinary bootstrap is disabled");
    expect(fs.readdirSync(directory)).toEqual(["todu-enrollment.json"]);
  });
  it("persists native replica identity across restarts and retries without a catalog", async () => {
    prepareEnrollmentStorage({ storagePath: directory });
    const first = await openPendingEnrollmentStorage(directory);
    const id = first.deviceId;
    await first.close();
    const second = await openPendingEnrollmentStorage(directory);
    try {
      expect(second.deviceId).toBe(id);
      expect(readEnrollmentState(directory)?.status.deviceId).toBe(id);
      expect(fs.existsSync(path.join(directory, "todu-catalog.id"))).toBe(false);
    } finally {
      await second.close();
    }
    expect(prepareEnrollmentStorage({ storagePath: directory })).toMatchObject({
      ok: true,
      value: { deviceId: id },
    });
  });
  it("refuses an initialized empty dataset without changing identity or catalog", async () => {
    const todu = await createTodu({ storagePath: directory });
    const id = todu.sync.getCatalogId();
    const replica = await todu.device.localId();
    await todu.close();
    expect(prepareEnrollmentStorage({ storagePath: directory })).toMatchObject({
      ok: false,
      error: { type: "validation" },
    });
    expect(fs.existsSync(path.join(directory, "todu-enrollment.json"))).toBe(false);
    const reopened = await createTodu({ storagePath: directory });
    try {
      expect(reopened.sync.getCatalogId()).toBe(id);
      expect(await reopened.device.localId()).toEqual(replica);
      expect(await reopened.task.list()).toEqual({ ok: true, value: [] });
    } finally {
      await reopened.close();
    }
  });
  it("refuses persisted documents with a missing catalog marker", async () => {
    const todu = await createTodu({ storagePath: directory });
    await todu.project.create({ name: "Do not replace" });
    await todu.close();
    fs.unlinkSync(path.join(directory, "todu-catalog.id"));
    expect(prepareEnrollmentStorage({ storagePath: directory })).toMatchObject({
      ok: false,
      error: { type: "validation" },
    });
    expect(fs.existsSync(path.join(directory, "todu-enrollment.json"))).toBe(false);
  });
  it("refuses a substitute catalog if an established enrollment loses its marker", async () => {
    writeEnrollmentState(directory, {
      version: 1,
      mode: "active",
      status: { stage: "active", catalogId: "2sFuwGcFcU9fkQDnYCdveNPoF6nK" },
    });
    await expect(initBootstrapStorage(directory)).rejects.toThrow(
      "refusing substitute catalog creation",
    );
    expect(fs.existsSync(path.join(directory, "todu-catalog.id"))).toBe(false);
  });

  it("never replaces a malformed marker or pending record", async () => {
    fs.writeFileSync(path.join(directory, "todu-catalog.id"), "");
    expect(prepareEnrollmentStorage({ storagePath: directory })).toMatchObject({ ok: false });
    expect(fs.readFileSync(path.join(directory, "todu-catalog.id"), "utf-8")).toBe("");
    fs.unlinkSync(path.join(directory, "todu-catalog.id"));
    fs.writeFileSync(path.join(directory, "todu-enrollment.json"), "corrupt");
    await expect(initBootstrapStorage(directory)).rejects.toThrow();
    expect(fs.existsSync(path.join(directory, "todu-catalog.id"))).toBe(false);
  });
});
