import { EventEmitter } from "node:events";
import type { NetworkInterfaceInfo } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSyncListenerEnableConfig } from "./sync-listener-enable.js";

const mocks = vi.hoisted(() => ({ interfaces: vi.fn(), createSocket: vi.fn() }));
vi.mock("node:os", () => ({
  default: { networkInterfaces: mocks.interfaces, homedir: () => "/home/test" },
}));
vi.mock("node:dgram", () => ({ createSocket: mocks.createSocket }));

function address(value: string, internal = false): NetworkInterfaceInfo {
  const family = value.includes(":") ? "IPv6" : "IPv4";
  return {
    address: value,
    family,
    internal,
    netmask: "",
    mac: "",
    cidr: null,
    ...(family === "IPv6" ? { scopeid: 0 } : {}),
  } as NetworkInterfaceInfo;
}

function interfaces(...values: string[]): void {
  mocks.interfaces.mockReturnValue(
    Object.fromEntries(values.map((value, index) => [`interface-${index}`, [address(value)]])),
  );
}

function route(source: string | Error | "timeout", closeError?: Error) {
  const socket = Object.assign(new EventEmitter(), {
    connect: vi.fn(() => {
      if (source === "timeout") return;
      queueMicrotask(() =>
        socket.emit(
          source instanceof Error ? "error" : "connect",
          source instanceof Error ? source : undefined,
        ),
      );
    }),
    address: vi.fn(() => ({ address: source })),
    close: vi.fn((callback: () => void) => {
      if (closeError) throw closeError;
      callback();
    }),
    send: vi.fn(),
  });
  mocks.createSocket.mockReturnValue(socket);
  return socket;
}

describe("explicit listener enablement address resolution", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("selects an ordinary Ethernet or Wi-Fi address without interface-name assumptions", async () => {
    interfaces("127.0.0.1", "169.254.2.3", "192.168.4.12", "fe80::1");
    expect(await resolveSyncListenerEnableConfig({})).toEqual({
      ok: true,
      value: { bind: "192.168.4.12", port: 24377 },
    });
    expect(mocks.createSocket).not.toHaveBeenCalled();
  });

  it.each([
    "10.42.1.2",
    "172.16.0.2",
    "172.31.255.254",
    "192.168.0.2",
    "fd12::abcd",
    "fc00::1",
  ])("accepts an unambiguous private address: %s", async (bind) => {
    interfaces(bind);
    expect(await resolveSyncListenerEnableConfig({})).toEqual({
      ok: true,
      value: { bind, port: 24377 },
    });
  });

  it("preserves a saved advertisement through detection and prefers an explicit advertised override", async () => {
    interfaces("192.168.4.12");
    expect(
      await resolveSyncListenerEnableConfig({ saved: { advertise: "https://saved.lan:24400" } }),
    ).toEqual({
      ok: true,
      value: { bind: "192.168.4.12", port: 24377, advertise: "https://saved.lan:24400" },
    });
    expect(
      await resolveSyncListenerEnableConfig({
        saved: { advertise: "https://saved.lan:24400" },
        advertise: "http://explicit.lan:24500/",
      }),
    ).toMatchObject({ ok: true, value: { advertise: "http://explicit.lan:24500" } });
  });
  it("prefers IPv4 on a dual-stack LAN and deduplicates addresses", async () => {
    interfaces("fd12::abcd", "10.42.1.2", "10.42.1.2");
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: true,
      value: { bind: "10.42.1.2" },
    });
    expect(mocks.createSocket).not.toHaveBeenCalled();
  });

  it("uses the OS-selected IPv4 route source with multiple interfaces, not enumeration order", async () => {
    interfaces("172.17.0.1", "192.168.4.12", "10.1.0.3");
    const socket = route("192.168.4.12");
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: true,
      value: { bind: "192.168.4.12" },
    });
    expect(socket.connect).toHaveBeenCalledExactlyOnceWith(9, "192.0.2.1");
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("uses and normalizes the OS-selected IPv6 route source", async () => {
    interfaces("fd12:0000:0000:0000:0000:0000:0000:abcd", "fd34::1");
    const socket = route("fd12::abcd");
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: true,
      value: { bind: "fd12::abcd" },
    });
    expect(mocks.createSocket).toHaveBeenCalledWith("udp6");
    expect(socket.connect).toHaveBeenCalledWith(9, "2001:db8::1");
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("rejects ambiguity when the route does not select a candidate", async () => {
    interfaces("192.168.4.12", "10.1.0.3", "fd12::1");
    route("203.0.113.1");
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { field: "sync.listener.bind", message: expect.stringContaining("--bind") },
    });
  });

  it("reports the route error and candidate addresses without guessing", async () => {
    interfaces("192.168.4.12", "10.1.0.3");
    const socket = route(new Error("No route available"));
    const result = await resolveSyncListenerEnableConfig({});
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("No route available") },
    });
    expect(result).toMatchObject({
      error: { message: expect.stringContaining("10.1.0.3, 192.168.4.12") },
    });
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("bounds and cleans up a route query that does not complete", async () => {
    vi.useFakeTimers();
    interfaces("192.168.4.12", "10.1.0.3");
    const socket = route("timeout");
    const result = resolveSyncListenerEnableConfig({});
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("timed out") },
    });
    expect(socket.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles route socket creation and synchronous connect failures", async () => {
    interfaces("10.1.0.3", "192.168.4.12");
    mocks.createSocket.mockImplementationOnce(() => {
      throw new Error("Socket unavailable");
    });
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Socket unavailable") },
    });
    const socket = route("timeout");
    socket.connect.mockImplementationOnce(() => {
      throw new Error("Connect unavailable");
    });
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Connect unavailable") },
    });
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("reports socket address and cleanup errors and clears the route deadline", async () => {
    vi.useFakeTimers();
    interfaces("10.1.0.3", "192.168.4.12");
    const socket = route("192.168.4.12");
    socket.address.mockImplementationOnce(() => {
      throw new Error("Address unavailable");
    });
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Address unavailable") },
    });
    expect(socket.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    route("192.168.4.12", new Error("Cleanup failed"));
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Cleanup failed") },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles cleanup of a socket that could not bind", async () => {
    interfaces("10.1.0.3", "192.168.4.12");
    const error = Object.assign(new Error("Not running"), { code: "ERR_SOCKET_DGRAM_NOT_RUNNING" });
    route(new Error("No route"), error);
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("No route") },
    });
  });

  it.each([
    [],
    ["127.0.0.1", "::1"],
    ["0.0.0.0", "::"],
    ["169.254.1.2", "fe80::1"],
    ["203.0.113.2", "2001:db8::1"],
    ["224.0.0.1", "ff02::1"],
    ["172.15.1.2", "172.32.0.1"],
  ])("refuses unavailable or unsuitable automatic candidates: %j", async (...values) => {
    interfaces(...values);
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("--bind") },
    });
    expect(mocks.createSocket).not.toHaveBeenCalled();
  });

  it("excludes internal private addresses", async () => {
    mocks.interfaces.mockReturnValue({ internal: [address("10.0.0.1", true)], absent: undefined });
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({ ok: false });
  });

  it("reports interface enumeration errors", async () => {
    mocks.interfaces.mockImplementationOnce(() => {
      throw new Error("Interface information unavailable");
    });
    expect(await resolveSyncListenerEnableConfig({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Interface information unavailable") },
    });
  });

  it("preserves disabled saved binding and port without detection", async () => {
    expect(
      await resolveSyncListenerEnableConfig({
        saved: { enabled: false, bind: "192.168.4.12", port: 24400 },
      }),
    ).toEqual({ ok: true, value: { bind: "192.168.4.12", port: 24400 } });
    expect(mocks.interfaces).not.toHaveBeenCalled();
  });

  it.each([
    {
      options: { bind: "127.0.0.1", saved: { bind: "192.168.4.12", port: 24400 } },
      bind: "127.0.0.1",
      port: 24400,
    },
    {
      options: { port: 24500, saved: { bind: "192.168.4.12", port: 24400 } },
      bind: "192.168.4.12",
      port: 24500,
    },
    { options: { saved: { enabled: false, bind: "::", port: 24400 } }, bind: "::", port: 24400 },
  ])("overrides only supplied settings without redetecting: $options", async ({
    options,
    bind,
    port,
  }) => {
    expect(await resolveSyncListenerEnableConfig(options)).toEqual({
      ok: true,
      value: { bind, port },
    });
    expect(mocks.interfaces).not.toHaveBeenCalled();
  });

  it.each([
    { saved: { bind: null } },
    { saved: { port: null } },
  ])("rejects invalid saved YAML values instead of substituting defaults: %j", async (options) => {
    expect(
      await resolveSyncListenerEnableConfig(
        options as unknown as Parameters<typeof resolveSyncListenerEnableConfig>[0],
      ),
    ).toMatchObject({ ok: false });
    expect(mocks.interfaces).not.toHaveBeenCalled();
  });

  it("detects only the missing bind while retaining the saved port", async () => {
    interfaces("192.168.4.12");
    expect(await resolveSyncListenerEnableConfig({ saved: { port: 24400 } })).toEqual({
      ok: true,
      value: { bind: "192.168.4.12", port: 24400 },
    });
  });

  it.each([
    "0.0.0.0",
    "::",
    "::1",
    "127.0.0.1",
    "203.0.113.2",
  ])("preserves an explicit override, including deliberate wildcard bindings: %s", async (bind) => {
    expect(
      await resolveSyncListenerEnableConfig({
        bind,
        port: 24500,
        saved: { bind: "192.168.4.12", port: 24400 },
      }),
    ).toEqual({ ok: true, value: { bind, port: 24500 } });
    expect(mocks.interfaces).not.toHaveBeenCalled();
  });

  it.each([
    { bind: "localhost" },
    { bind: "" },
    { port: 0 },
    { port: Number.NaN },
    { saved: { bind: "localhost" } },
    { saved: { port: 0 } },
  ])("validates supplied settings before detection without silent replacement: %j", async (options) => {
    expect(await resolveSyncListenerEnableConfig(options)).toMatchObject({ ok: false });
    expect(mocks.interfaces).not.toHaveBeenCalled();
  });
});
