import { describe, expect, it } from "vitest";
import { resolveSyncListenerConfig, type SyncListenerConfig } from "./config.js";

describe("LAN sync listener configuration", () => {
  it.each([
    undefined,
    {},
    { enabled: false },
    { bind: "0.0.0.0", port: 24377 },
  ])("never enables listening implicitly: %s", (config) => {
    expect(resolveSyncListenerConfig(config)).toEqual({ ok: true, value: null });
  });

  it("defaults only the port, not the bind address", () => {
    expect(resolveSyncListenerConfig({ enabled: true, bind: "192.168.1.10" })).toEqual({
      ok: true,
      value: { bind: "192.168.1.10", port: 24377 },
    });
    expect(resolveSyncListenerConfig({ enabled: true })).toMatchObject({
      ok: false,
      error: { field: "sync.listener.bind" },
    });
  });

  it.each([
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "::",
  ])("preserves an explicitly selected binding: %s", (bind) => {
    expect(resolveSyncListenerConfig({ enabled: true, bind, port: 24400 })).toEqual({
      ok: true,
      value: { bind, port: 24400 },
    });
  });

  it.each([
    "",
    "localhost",
    "*",
    "http://192.168.1.10",
    " 127.0.0.1 ",
  ])("rejects an invalid or ambiguous binding without substitution: %s", (bind) => {
    expect(resolveSyncListenerConfig({ enabled: true, bind })).toMatchObject({
      ok: false,
      error: { field: "sync.listener.bind" },
    });
  });

  it.each([
    0,
    -1,
    65536,
    24377.5,
    Number.NaN,
    "24377",
    null,
  ])("rejects a port that would require a default or ephemeral substitution: %s", (port) => {
    expect(
      resolveSyncListenerConfig({ enabled: true, bind: "127.0.0.1", port } as SyncListenerConfig),
    ).toMatchObject({ ok: false, error: { field: "sync.listener.port" } });
  });

  it.each(["true", 1, null])("rejects a non-boolean enablement flag: %s", (enabled) => {
    expect(resolveSyncListenerConfig({ enabled } as SyncListenerConfig)).toMatchObject({
      ok: false,
      error: { field: "sync.listener.enabled" },
    });
  });
});
