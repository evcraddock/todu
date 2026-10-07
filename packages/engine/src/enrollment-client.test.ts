import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createDeviceId,
  ENROLLMENT_POLL_INTERVAL_MS,
  type EnrollmentApproval,
  type EnrollmentResponse,
} from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrollmentClient, type EnrollmentClient } from "./enrollment-client.js";
import { prepareEnrollmentStorage, readEnrollmentState } from "./enrollment-storage.js";

const CATALOG_A = "2sFuwGcFcU9fkQDnYCdveNPoF6nK";
const CATALOG_B = "2Y2aJ8G8MSYn6wVqVEf4GQ9B5m5H";
const device = { id: createDeviceId("native-local-id"), name: "Laptop" };
const approval = (catalogId = CATALOG_A): EnrollmentApproval => ({
  catalogId,
  deviceId: device.id,
  sourceDeviceId: createDeviceId("native-source-id"),
  syncPath: `/sync/${catalogId}`,
});

describe("managed enrollment client boundaries", () => {
  let directory: string;
  let catalogId: string | null;
  let responseState: EnrollmentResponse["state"];
  let responseApproval: EnrollmentApproval;
  let requestId: string;
  const clients: EnrollmentClient[] = [];
  const activate = vi.fn(async (_source: unknown, _signal: AbortSignal) => {});
  const fetchMock = vi.fn<typeof fetch>();
  function open() {
    const client = createEnrollmentClient({
      storagePath: directory,
      getDevice: async () => device,
      getCatalogId: () => catalogId ?? readEnrollmentState(directory)?.approval?.catalogId ?? null,
      activate,
    });
    clients.push(client);
    return client;
  }
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-enrollment-client-"));
    catalogId = null;
    responseState = "pending";
    responseApproval = approval();
    activate.mockReset();
    activate.mockResolvedValue(undefined);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.body) requestId = JSON.parse(options.body as string).requestId;
      return new Response(
        JSON.stringify({
          requestId,
          state: responseState,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          ...(responseState === "approved" ? { approval: responseApproval } : {}),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.stop()));
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fs.rmSync(directory, { recursive: true });
  });

  it("requests metadata only and never activates an unapproved response", async () => {
    prepareEnrollmentStorage({ storagePath: directory });
    const client = open();
    expect(await client.begin("http://known-peer:24377")).toMatchObject({
      ok: true,
      value: { stage: "pending" },
    });
    expect(activate).not.toHaveBeenCalled();
    const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(Object.keys(request).sort()).toEqual(["device", "requestId"]);
    expect(request.device).toEqual(device);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    expect(fs.existsSync(path.join(directory, "todu-catalog.id"))).toBe(false);
    await vi.advanceTimersByTimeAsync(ENROLLMENT_POLL_INTERVAL_MS);
    expect(activate).not.toHaveBeenCalled();
  });
  it.each([
    "denied",
    "expired",
  ] as const)("stops polling %s requests without activating or deleting state", async (state) => {
    prepareEnrollmentStorage({ storagePath: directory });
    const client = open();
    await client.begin("http://known-peer:24377");
    responseState = state;
    await vi.advanceTimersByTimeAsync(ENROLLMENT_POLL_INTERVAL_MS);
    expect(client.status().stage).toBe(state);
    expect(activate).not.toHaveBeenCalled();
    const count = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENROLLMENT_POLL_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBe(count);
    expect(readEnrollmentState(directory)?.mode).toBe("pending");
  });
  it("refuses a wrong catalog approval before any state or native adapter mutation", async () => {
    catalogId = CATALOG_A;
    responseState = "approved";
    responseApproval = approval(CATALOG_B);
    const client = open();
    expect(await client.begin("http://known-peer:24377")).toMatchObject({ ok: false });
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(activate).not.toHaveBeenCalled();
  });
  it("defers approved attachment outside the request RPC and resumes a durable request after restart", async () => {
    prepareEnrollmentStorage({ storagePath: directory });
    responseState = "approved";
    const first = open();
    expect(await first.begin("http://known-peer:24377")).toMatchObject({
      ok: true,
      value: { stage: "attaching" },
    });
    expect(activate).not.toHaveBeenCalled();
    await first.stop();
    const resumed = open();
    resumed.resume();
    await vi.advanceTimersByTimeAsync(ENROLLMENT_POLL_INTERVAL_MS);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(resumed.status()).toMatchObject({
      stage: "active",
      catalogId: CATALOG_A,
      deviceId: device.id,
    });
    const count = fetchMock.mock.calls.length;
    await resumed.begin("http://known-peer:24377");
    expect(fetchMock.mock.calls.length).toBe(count);
    expect(activate).toHaveBeenCalledTimes(1);
  });
  it("binds failed pristine attachment to its approved dataset instead of exposing cached data to another dataset", async () => {
    prepareEnrollmentStorage({ storagePath: directory });
    responseState = "approved";
    activate.mockRejectedValue(new Error("Simulated partial bootstrap failure"));
    const client = open();
    await client.begin("http://known-peer:24377");
    await vi.advanceTimersByTimeAsync(ENROLLMENT_POLL_INTERVAL_MS);
    expect(client.status().stage).toBe("error");
    expect(readEnrollmentState(directory)?.approval?.catalogId).toBe(CATALOG_A);
    const before = fs.readFileSync(path.join(directory, "todu-enrollment.json"), "utf-8");
    responseApproval = approval(CATALOG_B);
    expect(await client.begin("http://different-peer:24377")).toMatchObject({ ok: false });
    expect(fs.readFileSync(path.join(directory, "todu-enrollment.json"), "utf-8")).toBe(before);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string).expectedCatalogId).toBe(
      CATALOG_A,
    );
  });
  it("aborts in-flight activation on cancel and never re-arms polling", async () => {
    prepareEnrollmentStorage({ storagePath: directory });
    responseState = "approved";
    activate.mockImplementation(
      async (_source, signal) =>
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        ),
    );
    const client = open();
    await client.begin("http://known-peer:24377");
    await vi.advanceTimersByTimeAsync(ENROLLMENT_POLL_INTERVAL_MS);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(await client.cancel()).toMatchObject({ ok: true, value: { stage: "cancelled" } });
    const count = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENROLLMENT_POLL_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBe(count);
    expect(readEnrollmentState(directory)?.mode).toBe("pending");
  });
  it("rejects document-bearing approval metadata", async () => {
    responseState = "approved";
    responseApproval = {
      ...approval(),
      documents: ["not an enrollment field"],
    } as EnrollmentApproval;
    const client = open();
    expect(await client.begin("http://known-peer:24377")).toMatchObject({ ok: false });
    expect(activate).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory)).toEqual([]);
  });
  it("caps response size and forbids credential-bearing endpoints", async () => {
    fetchMock.mockResolvedValue(new Response("x".repeat(8193)));
    const client = open();
    expect(await client.begin("http://known-peer:24377")).toMatchObject({ ok: false });
    expect(activate).not.toHaveBeenCalled();
    fetchMock.mockClear();
    expect(await client.begin("http://user:secret@known-peer:24377")).toMatchObject({
      ok: false,
      error: { type: "validation" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
