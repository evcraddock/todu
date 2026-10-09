import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDeviceId, deviceRegistryKey } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createListenerPublication } from "./listener-publication.js";
import { initBootstrapStorage, type Storage } from "./storage.js";

/** Native temporary storage only; these metadata tests do not open a network listener. */
describe("listener endpoint publication ownership", () => {
  let directory: string;
  let storage: Storage;
  let publication: ReturnType<typeof createListenerPublication>;
  let id: ReturnType<typeof createDeviceId>;
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-listener-publication-"));
    storage = await initBootstrapStorage(directory);
    id = createDeviceId((await storage.repo.storageId())!);
    publication = createListenerPublication({
      repo: storage.repo,
      catalog: storage.catalog,
      localId: id,
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await publication.close();
    await storage.close();
    fs.rmSync(directory, { recursive: true });
  });
  const endpoint = () => storage.catalog.doc()![deviceRegistryKey(id)].endpoint;
  const listening = (bind = "192.168.4.12", port = 24377) => ({
    state: "listening" as const,
    bind,
    port,
  });

  it("publishes the bound address and port on the existing native entry and is idempotent", async () => {
    const before = structuredClone(storage.catalog.doc()!);
    expect(await publication.apply(listening())).toEqual({
      ok: true,
      value: { state: "published", endpoint: "http://192.168.4.12:24377" },
    });
    expect(storage.catalog.doc()).toEqual({
      ...before,
      [deviceRegistryKey(id)]: {
        ...before[deviceRegistryKey(id)],
        endpoint: "http://192.168.4.12:24377",
      },
    });
    expect(await publication.apply(listening())).toMatchObject({
      ok: true,
      value: { state: "published" },
    });
    expect(await publication.apply(listening("192.168.4.13", 24400))).toMatchObject({
      ok: true,
      value: { endpoint: "http://192.168.4.13:24400" },
    });
    expect(endpoint()).toBe("http://192.168.4.13:24400");
  });

  it("retains ownership across restart, updates its own endpoint, and withdraws it when disabled", async () => {
    await publication.apply(listening());
    await publication.close();
    await storage.close();
    storage = await initBootstrapStorage(directory);
    publication = createListenerPublication({
      repo: storage.repo,
      catalog: storage.catalog,
      localId: id,
    });
    await publication.apply(listening("192.168.4.13", 24400));
    expect(endpoint()).toBe("http://192.168.4.13:24400");
    expect(await publication.apply({ state: "disabled" })).toMatchObject({
      ok: true,
      value: { state: "unavailable" },
    });
    expect(endpoint()).toBeUndefined();
    await publication.apply(listening());
    expect(endpoint()).toBe("http://192.168.4.12:24377");
  });

  it("preserves deliberate existing URLs even with a different bind and port", async () => {
    storage.catalog.change((doc) => {
      doc[deviceRegistryKey(id)].endpoint = "https://mini.lan:24400";
    });
    expect(await publication.apply(listening())).toEqual({
      ok: true,
      value: { state: "manual", endpoint: "https://mini.lan:24400" },
    });
    expect(endpoint()).toBe("https://mini.lan:24400");
    await publication.apply({ state: "error", error: "Bind failed" });
    expect(endpoint()).toBe("https://mini.lan:24400");
  });

  it("marks local manual overrides and clears as authoritative, including equal-value overrides", async () => {
    await publication.apply(listening());
    expect((await publication.setEndpoint("http://192.168.4.12:24377")).ok).toBe(true);
    await publication.apply(listening("192.168.4.13"));
    expect(endpoint()).toBe("http://192.168.4.12:24377");
    expect((await publication.setEndpoint(null)).ok).toBe(true);
    expect(await publication.apply(listening())).toEqual({
      ok: true,
      value: { state: "suppressed" },
    });
    expect(endpoint()).toBeUndefined();
  });

  it("does not overwrite a later replicated manual endpoint or clear", async () => {
    await publication.apply(listening());
    storage.catalog.change((doc) => {
      doc[deviceRegistryKey(id)].endpoint = "http://operator.lan:24377";
    });
    await publication.apply(listening("192.168.4.13"));
    expect(endpoint()).toBe("http://operator.lan:24377");
    storage.catalog.change((doc) => {
      delete doc[deviceRegistryKey(id)].endpoint;
    });
    expect(await publication.apply(listening())).toMatchObject({
      ok: true,
      value: { state: "suppressed" },
    });
    expect(endpoint()).toBeUndefined();
  });

  it("gives an explicit saved advertised override precedence and permits deliberate wildcard binding", async () => {
    await publication.setEndpoint("http://old.lan:24377");
    expect(
      await publication.apply(listening("0.0.0.0"), {
        enabled: true,
        bind: "0.0.0.0",
        advertise: "https://mini.lan:24400",
      }),
    ).toEqual({ ok: true, value: { state: "manual", endpoint: "https://mini.lan:24400" } });
    expect(endpoint()).toBe("https://mini.lan:24400");
  });

  it.each([
    "0.0.0.0",
    "::",
  ])("does not invent an endpoint for wildcard %s and withdraws an old automatic endpoint", async (bind) => {
    expect(await publication.apply(listening(bind))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("wildcard") },
    });
    expect(endpoint()).toBeUndefined();
    await publication.apply(listening());
    expect(await publication.apply(listening(bind))).toMatchObject({ ok: false });
    expect(endpoint()).toBeUndefined();
  });

  it("formats IPv6 endpoints and removes only its automatic endpoint on listener failure", async () => {
    await publication.apply(listening("fd12::abcd", 24400));
    expect(endpoint()).toBe("http://[fd12::abcd]:24400");
    await publication.apply({ state: "error", error: "Address unavailable" });
    expect(endpoint()).toBeUndefined();
  });

  it("never reenrolls missing or removed entries and never touches another device", async () => {
    const other = createDeviceId("other");
    storage.catalog.change((doc) => {
      doc[deviceRegistryKey(other)] = { id: other, name: "Other", endpoint: "http://other.lan" };
      doc[deviceRegistryKey(id)].removed = true;
    });
    expect(await publication.apply(listening())).toMatchObject({ ok: false });
    expect(storage.catalog.doc()![deviceRegistryKey(id)].removed).toBe(true);
    expect(storage.catalog.doc()![deviceRegistryKey(other)].endpoint).toBe("http://other.lan");
    storage.catalog.change((doc) => {
      delete doc[deviceRegistryKey(id)];
    });
    expect(await publication.apply(listening())).toMatchObject({ ok: false });
    expect(storage.catalog.doc()![deviceRegistryKey(id)]).toBeUndefined();
  });

  it("isolates metadata-storage failures instead of silently publishing", async () => {
    const save = vi
      .spyOn(storage.repo.storageSubsystem!, "save")
      .mockRejectedValueOnce(new Error("Receipt write failed"));
    expect(await publication.apply(listening())).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Receipt write failed") },
    });
    expect(endpoint()).toBeUndefined();
    save.mockRestore();
    expect((await publication.apply(listening())).ok).toBe(true);
  });

  it("recovers an interrupted automatic publication without treating it as a manual override", async () => {
    const flush = vi.spyOn(storage.repo, "flush").mockRejectedValueOnce(new Error("Flush failed"));
    expect(await publication.apply(listening())).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Flush failed") },
    });
    flush.mockRestore();
    expect((await publication.apply(listening("192.168.4.13", 24400))).ok).toBe(true);
    expect(endpoint()).toBe("http://192.168.4.13:24400");
  });

  it("does not replace an operator edit that arrives during an ownership write", async () => {
    const save = storage.repo.storageSubsystem!.save.bind(storage.repo.storageSubsystem!);
    vi.spyOn(storage.repo.storageSubsystem!, "save").mockImplementationOnce(async (...args) => {
      await save(...args);
      storage.catalog.change((doc) => {
        doc[deviceRegistryKey(id)].endpoint = "http://operator.lan:24377";
      });
    });
    expect(await publication.apply(listening())).toMatchObject({
      ok: true,
      value: { state: "manual", endpoint: "http://operator.lan:24377" },
    });
    expect(endpoint()).toBe("http://operator.lan:24377");
  });

  it("serializes automatic and manual writes, drains close, and rejects later work", async () => {
    const automatic = publication.apply(listening());
    const manual = publication.setEndpoint("http://operator.lan:24377");
    await publication.close();
    expect((await automatic).ok).toBe(true);
    expect((await manual).ok).toBe(true);
    expect(endpoint()).toBe("http://operator.lan:24377");
    expect(await publication.apply(listening())).toMatchObject({ ok: false });
  });
});
