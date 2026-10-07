import { describe, expect, it } from "vitest";
import { resolveEnrollmentEndpoint } from "./enrollment-endpoint.js";

const listener = { enabled: true, bind: "192.168.1.20" };

describe("enrollment advertised endpoint", () => {
  it("uses the configured concrete listener without a redundant argument", () => {
    expect(resolveEnrollmentEndpoint({ listener })).toEqual({
      ok: true,
      value: "http://192.168.1.20:24377",
    });
    expect(resolveEnrollmentEndpoint({ listener: { ...listener, port: 24400 } })).toEqual({
      ok: true,
      value: "http://192.168.1.20:24400",
    });
  });
  it("brackets a configured IPv6 address", () => {
    expect(resolveEnrollmentEndpoint({ listener: { enabled: true, bind: "fd00::20" } })).toEqual({
      ok: true,
      value: "http://[fd00::20]:24377",
    });
  });
  it("prefers an explicit override, then a published endpoint", () => {
    expect(resolveEnrollmentEndpoint({ listener, published: "http://laptop.lan:24377" })).toEqual({
      ok: true,
      value: "http://laptop.lan:24377",
    });
    expect(
      resolveEnrollmentEndpoint({
        listener,
        published: "http://old.lan:24377",
        override: "https://new.lan",
      }),
    ).toEqual({ ok: true, value: "https://new.lan" });
  });
  it.each(["0.0.0.0", "::"])("requires an advertised endpoint for wildcard binding %s", (bind) => {
    expect(resolveEnrollmentEndpoint({ listener: { enabled: true, bind } })).toMatchObject({
      ok: false,
      error: { field: "device.endpoint", message: expect.stringContaining("--advertise") },
    });
    expect(
      resolveEnrollmentEndpoint({
        listener: { enabled: true, bind },
        override: "http://laptop.lan:24377",
      }).ok,
    ).toBe(true);
  });
  it.each([
    undefined,
    { enabled: false },
    { enabled: true },
    { enabled: true, bind: "not-an-ip" },
    { enabled: true, bind: "127.0.0.1", port: 0 },
  ])("does not enable or repair invalid listener settings: %j", (config) => {
    expect(
      resolveEnrollmentEndpoint({ listener: config, override: "http://laptop.lan:24377" }).ok,
    ).toBe(false);
  });
  it.each([
    "http://0.0.0.0:24377",
    "http://[::]:24377",
    "http://user:secret@laptop.lan",
    "ws://laptop.lan/sync/catalog",
  ])("rejects unusable advertised endpoints: %s", (override) => {
    expect(resolveEnrollmentEndpoint({ listener, override }).ok).toBe(false);
  });
});
