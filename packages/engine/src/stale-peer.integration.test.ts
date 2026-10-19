import { once } from "node:events";
import fs from "node:fs";
import { createConnection, createServer, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { cbor } from "@automerge/automerge-repo/slim";
import { type CatalogDocument, createDeviceId } from "@todu/core";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { reserveTcpPort } from "../../../scripts/test-helpers/sync-server.js";
import {
  createEnrollmentPeerConnection,
  type EnrollmentPeerConnection,
} from "./enrollment-peer.js";
import { createPersistentRepo, initBootstrapStorage, type Storage } from "./storage.js";
import { addRemoteSyncAdapter } from "./sync-client.js";
import { type SyncListener, startSyncListener } from "./sync-listener.js";

/** Drop the upstream without delivering EOF or any subsequent bytes to the client. */
async function blackholeProxy(targetPort: number) {
  const sockets = new Set<Socket>();
  let blocked = false;
  const server = createServer((client) => {
    const upstream = createConnection({ host: "127.0.0.1", port: targetPort });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => socket.destroy());
    }
    client.on("data", (bytes) => {
      if (!blocked) upstream.write(bytes);
    });
    upstream.on("data", (bytes) => {
      if (!blocked) client.write(bytes);
    });
    upstream.on("end", () => {
      if (!blocked) client.end();
    });
    client.on("close", () => upstream.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Proxy did not bind");
  return {
    port: address.port,
    drop() {
      blocked = true;
      // The client-facing sockets deliberately stay open, with no close or error event.
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

it.each([false, true])(
  "retires a verified half-open outbound peer so the same persistent replica can restart and replicate (transferred=%s)",
  { timeout: 25_000 },
  async (transferred) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-stale-peer-"));
    const storages: Storage[] = [];
    const listeners: SyncListener[] = [];
    const peers: EnrollmentPeerConnection[] = [];
    let proxy: Awaited<ReturnType<typeof blackholeProxy>> | undefined;
    try {
      const sourcePath = path.join(directory, "source");
      let source = await initBootstrapStorage(sourcePath);
      storages.push(source);
      const catalogId = source.catalog.documentId;
      const localPath = path.join(directory, "local");
      const localRepo = createPersistentRepo(localPath);
      const binary = await source.repo.export(catalogId);
      if (!binary) throw new Error("Missing seed catalog export");
      localRepo.import<CatalogDocument>(binary, { docId: catalogId });
      await localRepo.flush();
      fs.writeFileSync(path.join(localPath, "todu-catalog.id"), catalogId);
      const local = await initBootstrapStorage(localPath, localRepo);
      storages.push(local);
      expect(local.catalog.documentId).toBe(catalogId);
      const sourceId = createDeviceId((await source.repo.storageId())!);
      const localId = createDeviceId((await local.repo.storageId())!);
      expect(localId).not.toBe(sourceId);
      const warn = vi.fn();
      async function listen(storage: Storage) {
        const port = await reserveTcpPort();
        const result = await startSyncListener({
          repo: storage.repo,
          catalogId,
          config: { enabled: true, bind: "127.0.0.1", port },
          logger: { warn },
          onError: (message) => {
            throw new Error(message);
          },
        });
        if (!result.ok) throw new Error(result.error.message);
        listeners.push(result.value);
        return { port, listener: result.value };
      }
      const sourceListener = await listen(source);
      proxy = await blackholeProxy(sourceListener.port);
      const existing = transferred
        ? addRemoteSyncAdapter(local.repo, `ws://127.0.0.1:${proxy.port}/sync/${catalogId}`, 2_000)
        : undefined;
      if (existing) await expect.poll(() => existing.remotePeerId).toBe(source.repo.peerId);
      const original = createEnrollmentPeerConnection({
        repo: local.repo,
        adapter: existing,
        source: {
          endpoint: `http://127.0.0.1:${proxy.port}`,
          approval: {
            catalogId,
            deviceId: localId,
            sourceDeviceId: sourceId,
            syncPath: `/sync/${catalogId}`,
          },
        },
      });
      peers.push(original);
      await original.ready();
      const oldSocket = original.getAdapter!()!.socket!;
      const description = source.repo.create({ description: "Before connection loss" });
      const received = await local.repo.find<{ description: string }>(description.documentId, {
        signal: AbortSignal.timeout(3_000),
      });
      expect(received.doc().description).toBe("Before connection loss");
      const localListener = await listen(local);
      // A live simultaneous clone must still be refused, without evicting the original.
      const clone = new WebSocket(`ws://127.0.0.1:${localListener.port}/sync/${catalogId}`);
      try {
        await once(clone, "open", { signal: AbortSignal.timeout(3_000) });
        const rejected = once(clone, "close", { signal: AbortSignal.timeout(3_000) });
        clone.send(
          cbor.encode({
            type: "join",
            senderId: "simultaneous-clone",
            peerMetadata: { storageId: sourceId, isEphemeral: false },
            supportedProtocolVersions: ["1"],
          }),
        );
        expect((await rejected)[0]).toBe(1002);
        expect(
          warn.mock.calls.some(([, context]) =>
            String(context?.error).includes("Duplicate live native replica identity"),
          ),
        ).toBe(true);
        expect(oldSocket.readyState).toBe(oldSocket.OPEN);
        description.change((doc) => {
          doc.description = "Original remains connected";
        });
        await expect.poll(() => received.doc().description).toBe("Original remains connected");
        warn.mockClear();
      } finally {
        clone.terminate();
      }
      const initialPeerId = source.repo.peerId;

      proxy.drop();
      await sourceListener.listener.close();
      description.change((doc) => {
        doc.description = "Changed while connection was lost";
      });
      await source.close();
      storages.splice(storages.indexOf(source), 1);
      expect(oldSocket.readyState).toBe(oldSocket.OPEN);
      source = await initBootstrapStorage(sourcePath);
      storages.push(source);
      expect(await source.repo.storageId()).toBe(sourceId);
      expect(source.repo.peerId).not.toBe(initialPeerId);
      const restarted = createEnrollmentPeerConnection({
        repo: source.repo,
        source: {
          endpoint: `http://127.0.0.1:${localListener.port}`,
          approval: {
            catalogId,
            deviceId: sourceId,
            sourceDeviceId: localId,
            syncPath: `/sync/${catalogId}`,
          },
        },
      });
      peers.push(restarted);
      await expect
        .poll(() =>
          warn.mock.calls.some(([, context]) =>
            String(context?.error).includes("Duplicate live native replica identity"),
          ),
        )
        .toBe(true);
      await expect.poll(() => oldSocket.readyState, { timeout: 13_000 }).toBe(oldSocket.CLOSED);
      await expect
        .poll(() => restarted.getAdapter?.()?.remotePeerId, { timeout: 5_000 })
        .toBe(local.repo.peerId);
      await restarted.ready();

      const recovered = await source.repo.find<{ description: string }>(description.documentId, {
        signal: AbortSignal.timeout(3_000),
      });
      await expect.poll(() => received.doc().description).toBe("Changed while connection was lost");
      received.change((doc) => {
        doc.description = "Bidirectional replication resumed";
      });
      await expect
        .poll(() => recovered.doc().description)
        .toBe("Bidirectional replication resumed");
      const fresh = source.repo.create({ description: "Available after automatic recovery" });
      const freshReceived = await local.repo.find<{ description: string }>(fresh.documentId, {
        signal: AbortSignal.timeout(3_000),
      });
      expect(freshReceived.doc().description).toBe("Available after automatic recovery");
      // The recovering daemon and both persistent identities are unchanged.
      expect(await local.repo.storageId()).toBe(localId);
      expect(await source.repo.storageId()).toBe(sourceId);
    } finally {
      for (const peer of peers) peer.close();
      await proxy?.close();
      await Promise.all(listeners.map((listener) => listener.close()));
      await Promise.all(storages.map((storage) => storage.close()));
      fs.rmSync(directory, { recursive: true });
    }
  },
);
