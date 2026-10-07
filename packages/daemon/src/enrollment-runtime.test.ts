import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDeviceId, type SyncListenerConfig } from "@todu/core";
import { createEnrollmentClient, openPendingEnrollmentStorage, type Todu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrollmentRuntime } from "./enrollment-runtime.js";
import type { DaemonLogger } from "./logger.js";
import type { DaemonRpcContext } from "./rpc.js";

vi.mock("@todu/engine", async (original) => ({
  ...(await original<typeof import("@todu/engine")>()),
  createEnrollmentClient: vi.fn(() => ({
    begin: vi.fn(async () => ({ ok: true, value: { stage: "pending" } })),
    stop: vi.fn(async () => {}),
  })),
  openPendingEnrollmentStorage: vi.fn(async () => ({
    deviceId: createDeviceId("local"),
    close: vi.fn(async () => {}),
  })),
}));

describe("daemon enrollment endpoint wiring", () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-enrollment-wiring-"));
    vi.mocked(createEnrollmentClient).mockClear();
  });
  afterEach(() => fs.rmSync(directory, { recursive: true }));
  function setup(
    listener: SyncListenerConfig | undefined = { enabled: true, bind: "127.0.0.1", port: 24400 },
    published?: string,
    pending = false,
  ) {
    const device = {
      id: createDeviceId("local"),
      name: "Laptop",
      ...(published ? { endpoint: published } : {}),
    };
    const todu = {
      device: {
        localId: async () => ({ ok: true, value: device.id }),
        list: async () => ({ ok: true, value: [device] }),
      },
    } as unknown as Todu;
    const runtime = createEnrollmentRuntime({
      storagePath: directory,
      syncListener: listener,
      getTodu: () => (pending ? null : todu),
      isRunning: () => true,
      activateTodu: vi.fn(),
      createTodu: vi.fn(),
      logger: { warn: vi.fn() } as unknown as DaemonLogger,
    });
    return {
      run: (params: Record<string, unknown> = {}) =>
        runtime.handlers.sync!.enroll(
          {
            id: "request",
            method: "sync.enroll",
            params: { endpoint: "http://source.lan:24377", ...params },
          },
          {} as DaemonRpcContext,
        ),
    };
  }
  it("supplies the configured endpoint to the joining client without extra CLI input", async () => {
    const { run } = setup();
    expect(await run()).toMatchObject({ result: { stage: "pending" } });
    const client = vi.mocked(createEnrollmentClient).mock.results[0].value;
    expect(client.begin).toHaveBeenCalledExactlyOnceWith("http://source.lan:24377", {
      registration: {
        id: createDeviceId("local"),
        name: "Laptop",
        endpoint: "http://127.0.0.1:24400",
      },
    });
    expect(fs.readdirSync(directory)).toEqual([]);
  });
  it("uses published metadata and an optional explicit override", async () => {
    const { run } = setup({ enabled: true, bind: "0.0.0.0" }, "http://laptop.lan:24377");
    await run({ advertisedEndpoint: "http://replacement.lan:24377" });
    expect(vi.mocked(createEnrollmentClient).mock.results[0].value.begin).toHaveBeenCalledWith(
      "http://source.lan:24377",
      { registration: expect.objectContaining({ endpoint: "http://replacement.lan:24377" }) },
    );
  });
  it("supports configured pristine pending setup without an active listener", async () => {
    const { run } = setup({ enabled: true, bind: "127.0.0.1", port: 24400 }, undefined, true);
    await run();
    expect(openPendingEnrollmentStorage).toHaveBeenCalled();
    expect(vi.mocked(createEnrollmentClient).mock.results[0].value.begin).toHaveBeenCalledWith(
      "http://source.lan:24377",
      { registration: expect.objectContaining({ endpoint: "http://127.0.0.1:24400" }) },
    );
  });
  it.each([
    { enabled: false },
    { enabled: true, bind: "0.0.0.0" },
  ])("refuses missing or ambiguous setup before any request: %j", async (listener) => {
    const { run } = setup(listener);
    expect(await run()).toHaveProperty("error");
    expect(createEnrollmentClient).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory)).toEqual([]);
  });
  it("rejects non-string advertised overrides without invoking the client", async () => {
    expect(await setup().run({ advertisedEndpoint: 123 })).toHaveProperty("error");
    expect(createEnrollmentClient).not.toHaveBeenCalled();
  });
});
