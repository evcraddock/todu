import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CatalogDocument } from "@todu/core";
import { createDeviceId, deviceRegistryKey } from "@todu/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reserveTcpPort } from "../../../scripts/test-helpers/sync-server.js";
import { createTodu } from "./index.js";
import { initBootstrapStorage, type Storage } from "./storage.js";
import { type SyncListener, startSyncListener } from "./sync-listener.js";
import type { Todu } from "./todu.js";

/** Two temporary local Repos and one native loopback listener, not production convergence proof. */
describe("native exchange across shared server role changes", () => {
  let directory: string;
  let client: Todu | undefined;
  let source: Storage | undefined;
  let listener: SyncListener | undefined;
  afterEach(async () => {
    await client?.close();
    await listener?.close();
    await source?.close();
    client = undefined;
    source = undefined;
    listener = undefined;
    if (directory) fs.rmSync(directory, { recursive: true });
  });
  it.each([
    "stop",
    "disable",
    "repoint",
    "loss cycle",
  ])("keeps actual exchange through %s, re-enable, peer removal and shutdown", async (action) => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-native-server-role-"));
    source = await initBootstrapStorage(path.join(directory, "source"));
    const local = await initBootstrapStorage(path.join(directory, "client"));
    const catalogId = local.catalog.documentId;
    const sourceId = createDeviceId((await source.repo.storageId())!);
    const port = await reserveTcpPort();
    const started = await startSyncListener({
      repo: source.repo,
      catalogId,
      config: { enabled: true, bind: "127.0.0.1", port },
    });
    if (!started.ok) throw new Error(started.error.message);
    listener = started.value;
    const url = `ws://127.0.0.1:${port}/sync/${catalogId}`;
    local.catalog.change((doc) => {
      doc[deviceRegistryKey(sourceId)] = {
        id: sourceId,
        name: "Native source",
        endpoint: `http://127.0.0.1:${port}`,
      };
    });
    await local.close();
    const warn = vi.fn();
    client = await createTodu({
      syncLogger: { info: vi.fn(), warn },
      storagePath: path.join(directory, "client"),
      remoteSync: { server: url },
      registeredPeerConnections: true,
    });
    await expect.poll(() => client!.sync.serverStatus().state, { timeout: 5000 }).toBe("connected");
    expect(await client.sync.reloadPeers()).toMatchObject({
      ok: true,
      value: { retained: 1, added: 0 },
    });
    const remote = await source.repo.find<CatalogDocument>(catalogId);
    const exchange = async (name: string) => {
      expect((await client!.project.create({ name })).ok).toBe(true);
      await expect
        .poll(() => remote.doc()?.projects.some((project) => project.name === name), {
          timeout: 5000,
        })
        .toBe(true);
    };
    await exchange("before");
    if (action === "loss cycle") {
      const states: string[] = [];
      const unsubscribe = client.sync.onStatusChange((status) => states.push(status.remote.state));
      try {
        await listener.close();
        listener = undefined;
        await expect.poll(() => states.at(-1), { timeout: 5000 }).toBe("disconnected");
        const restarted = await startSyncListener({
          repo: source.repo,
          catalogId,
          config: { enabled: true, bind: "127.0.0.1", port },
        });
        if (!restarted.ok) throw new Error(restarted.error.message);
        listener = restarted.value;
        await expect.poll(() => states.at(-1), { timeout: 5000 }).toBe("connected");
        await exchange("after recovery");
        const failures = () =>
          warn.mock.calls.filter(([, context]) => JSON.stringify(context).includes("ECONNREFUSED"))
            .length;
        const before = failures();
        await listener.close();
        listener = undefined;
        await expect.poll(() => states.at(-1), { timeout: 5000 }).toBe("disconnected");
        await expect.poll(failures, { timeout: 5000 }).toBeGreaterThan(before);
        expect(client.sync.serverStatus()).toMatchObject({
          enabled: true,
          running: true,
          state: "disconnected",
        });
        expect(client.sync.status().remote.state).toBe("disconnected");
        expect(await client.sync.reloadPeers()).toMatchObject({
          ok: true,
          value: { retained: 1, added: 0 },
        });
        expect((await client.project.create({ name: "local while lost" })).ok).toBe(true);
        expect(await client.project.list()).toMatchObject({
          ok: true,
          value: expect.arrayContaining([expect.objectContaining({ name: "local while lost" })]),
        });
      } finally {
        unsubscribe();
      }
      return;
    }
    if (action === "stop") await client.sync.stop();
    else
      expect(
        (
          await client.sync.configureServer(
            action === "disable" ? { enabled: false } : { server: "ws://127.0.0.1:1" },
          )
        ).ok,
      ).toBe(true);
    expect(await client.sync.reloadPeers()).toMatchObject({
      ok: true,
      value: { retained: 1, added: 0 },
    });
    await exchange("after");
    expect((await client.sync.configureServer({ server: url, enabled: true })).ok).toBe(true);
    await exchange("enabled again");
    expect((await client.device.remove(sourceId)).ok).toBe(true);
    expect(await client.sync.reloadPeers()).toMatchObject({ ok: true, value: { removed: 1 } });
    await exchange("server role alone");
    await client.sync.stop();
    expect(client.sync.getCatalogId()).toBe(catalogId);
  }, 15000);
});
