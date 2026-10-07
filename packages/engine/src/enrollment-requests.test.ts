import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createDeviceId,
  createEnrollmentRequestId,
  type Device,
  ENROLLMENT_REQUEST_TTL_MS,
  MAX_ENROLLMENT_REQUESTS,
  ok,
} from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrollmentRequestStore } from "./enrollment-requests.js";

describe("machine-local enrollment approval journal", () => {
  let directory: string;
  let now: number;
  let catalogId: string;
  const registered = new Map<string, Device>();
  const register = vi.fn(async (device: Device) => {
    if (!registered.has(device.id)) registered.set(device.id, structuredClone(device));
    return ok(registered.get(device.id)!);
  });
  const input = () => ({
    requestId: createEnrollmentRequestId(crypto.randomUUID()),
    device: {
      id: createDeviceId("joining-native-id"),
      name: "Laptop",
      endpoint: "http://laptop.lan:24377",
    },
  });
  const open = () =>
    createEnrollmentRequestStore({
      storagePath: directory,
      getContext: async () => ({ catalogId, deviceId: createDeviceId("source-native-id") }),
      registerDevice: register,
      now: () => now,
    });
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-enrollment-journal-"));
    now = Date.now();
    catalogId = "current-catalog";
    registered.clear();
    register.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true });
  });

  it("returns only request metadata until local approval and retains a durable receipt", async () => {
    const store = open();
    const request = input();
    const response = await store.submit(request);
    expect(response).toMatchObject({
      ok: true,
      value: { requestId: request.requestId, state: "pending" },
    });
    if (response.ok)
      expect(Object.keys(response.value).sort()).toEqual(["expiresAt", "requestId", "state"]);
    expect(register).not.toHaveBeenCalled();
    expect(await store.approve(request.requestId)).toMatchObject({
      ok: true,
      value: {
        state: "approved",
        approval: { catalogId, deviceId: request.device.id, syncPath: `/sync/${catalogId}` },
      },
    });
    expect(await open().poll(request.requestId)).toMatchObject({
      ok: true,
      value: { state: "approved" },
    });
    expect(register).toHaveBeenCalledTimes(1);
  });
  it("refuses new endpoint-less requests while retaining readable historical journals", async () => {
    const request = input();
    const legacy = { ...request, device: { id: request.device.id, name: request.device.name } };
    expect(await open().submit(legacy)).toMatchObject({
      ok: false,
      error: { field: "device.endpoint" },
    });
    expect(fs.readdirSync(directory)).toEqual([]);
    fs.writeFileSync(
      path.join(directory, "todu-enrollment-requests.json"),
      JSON.stringify([
        {
          ...legacy,
          catalogId,
          state: "pending",
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 60000).toISOString(),
        },
      ]),
    );
    expect(await open().list()).toMatchObject({
      ok: true,
      value: [expect.objectContaining({ device: legacy.device })],
    });
  });
  it("deduplicates retries even when the initial response and request UUID are lost", async () => {
    const store = open();
    const request = input();
    await store.submit(request);
    const retried = await store.submit({
      ...request,
      requestId: createEnrollmentRequestId(crypto.randomUUID()),
      device: { ...request.device, name: "Laptop", id: request.device.id },
    });
    expect(retried).toMatchObject({ ok: true, value: { requestId: request.requestId } });
    expect(await store.list()).toMatchObject({
      ok: true,
      value: [expect.objectContaining({ requestId: request.requestId })],
    });
  });
  it("does not change existing member metadata or add duplicate rows", async () => {
    const store = open();
    const request = input();
    registered.set(request.device.id, {
      ...request.device,
      name: "Existing name",
      endpoint: "http://old-host:24377",
    });
    await store.submit(request);
    await store.approve(request.requestId);
    await store.approve(request.requestId);
    expect(register).toHaveBeenCalledTimes(1);
    expect(registered.size).toBe(1);
    expect(registered.get(request.device.id)?.name).toBe("Existing name");
  });
  it("denies without registration, catalog disclosure, or later approval", async () => {
    const store = open();
    const request = input();
    await store.submit(request);
    expect(await store.deny(request.requestId)).toMatchObject({
      ok: true,
      value: { state: "denied" },
    });
    expect(await store.poll(request.requestId)).not.toHaveProperty("value.approval");
    expect(await store.approve(request.requestId)).toMatchObject({ ok: false });
    expect(register).not.toHaveBeenCalled();
  });
  it("expires pending requests without adding or removing membership", async () => {
    const store = open();
    const request = input();
    await store.submit(request);
    now += ENROLLMENT_REQUEST_TTL_MS + 1;
    expect(await store.poll(request.requestId)).toMatchObject({
      ok: true,
      value: { state: "expired" },
    });
    expect(await store.approve(request.requestId)).toMatchObject({ ok: false });
    expect(register).not.toHaveBeenCalled();
  });
  it("refuses a different initialized catalog before writing a request", async () => {
    expect(
      await open().submit({ ...input(), expectedCatalogId: "different-empty-catalog" }),
    ).toMatchObject({ ok: false, error: { field: "expectedCatalogId" } });
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(register).not.toHaveBeenCalled();
  });
  it("refuses a clone of the source's native identity", async () => {
    const request = input();
    request.device.id = createDeviceId("source-native-id");
    expect(await open().submit(request)).toMatchObject({ ok: false });
    expect(fs.readdirSync(directory)).toEqual([]);
  });
  it("does not disclose or approve requests for a catalog that is no longer current", async () => {
    const store = open();
    const request = input();
    await store.submit(request);
    catalogId = "another-catalog";
    expect(await store.poll(request.requestId)).toMatchObject({ ok: false });
    expect(await store.approve(request.requestId)).toMatchObject({ ok: false });
    expect(register).not.toHaveBeenCalled();
    expect(await store.list()).toEqual({ ok: true, value: [] });
  });
  it("rejects changed retry metadata", async () => {
    const store = open();
    const request = input();
    await store.submit(request);
    expect(
      await store.submit({ ...request, device: { ...request.device, name: "Different" } }),
    ).toMatchObject({ ok: false });
  });
  it("bounds the journal and only evicts terminal receipts, never membership", async () => {
    const store = open();
    for (let i = 0; i < MAX_ENROLLMENT_REQUESTS; i++)
      await store.submit({
        ...input(),
        device: {
          id: createDeviceId(`native-${i}`),
          name: `Device ${i}`,
          endpoint: "http://laptop.lan:24377",
        },
      });
    expect(await store.submit(input())).toMatchObject({ ok: false, error: { field: "requests" } });
    now += ENROLLMENT_REQUEST_TTL_MS + 1;
    expect(await store.submit(input())).toMatchObject({ ok: true });
    const listed = await store.list();
    if (listed.ok) expect(listed.value.length).toBe(MAX_ENROLLMENT_REQUESTS);
    expect(register).not.toHaveBeenCalled();
  });
  it("recovers partial approval after registration and a failed final journal write", async () => {
    const store = open();
    const request = input();
    await store.submit(request);
    const rename = fs.renameSync;
    let writes = 0;
    const failure = vi.spyOn(fs, "renameSync").mockImplementation((...args) => {
      if (++writes === 2) throw new Error("Simulated lost final approval write");
      return rename(...args);
    });
    expect(await store.approve(request.requestId)).toMatchObject({ ok: false });
    failure.mockRestore();
    expect(registered.size).toBe(1);
    expect(await open().poll(request.requestId)).toMatchObject({
      ok: true,
      value: { state: "approved" },
    });
    expect(registered.size).toBe(1);
    expect(await open().deny(request.requestId)).toMatchObject({ ok: false });
  });
  it("fails explicitly for a corrupt journal instead of discarding approvals", async () => {
    fs.writeFileSync(path.join(directory, "todu-enrollment-requests.json"), "broken");
    expect(await open().submit(input())).toMatchObject({ ok: false, error: { type: "storage" } });
    expect(fs.readFileSync(path.join(directory, "todu-enrollment-requests.json"), "utf-8")).toBe(
      "broken",
    );
  });
});
