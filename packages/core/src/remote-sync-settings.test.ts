import { describe, expect, it } from "vitest";
import { resolveRemoteSyncSettings } from "./config.js";
import { updateRemoteSyncSettings } from "./remote-sync-settings.js";

describe("optional server settings", () => {
  it("retains a disabled destination and legacy URL-only enablement", () => {
    expect(
      resolveRemoteSyncSettings(
        { sync: { remote: { server: "ws://server:3030", enabled: false } } },
        { env: {} },
      ),
    ).toEqual({ server: "ws://server:3030", enabled: false });
    expect(
      resolveRemoteSyncSettings({ sync: { remote: { server: "ws://server:3030" } } }, { env: {} }),
    ).toEqual({ server: "ws://server:3030", enabled: true });
    expect(resolveRemoteSyncSettings({}, { env: {} })).toEqual({ enabled: false });
  });
  it("does not rewrite or newly restrict an existing legacy destination when toggling", () => {
    expect(
      updateRemoteSyncSettings(
        { server: "http://legacy:3030", enabled: true },
        { server: "http://legacy:3030", enabled: false },
      ),
    ).toEqual({ ok: true, value: { server: "http://legacy:3030", enabled: false } });
  });
  it("preserves environment precedence", () => {
    expect(
      resolveRemoteSyncSettings(
        { sync: { remote: { server: "ws://saved:3030", enabled: true } } },
        { env: { TODU_SYNC_SERVER: "ws://override:3030", TODU_SYNC_ENABLED: "false" } },
      ),
    ).toEqual({ server: "ws://override:3030", enabled: false });
  });
  it("disables and re-enables without losing the URL", () => {
    const disabled = updateRemoteSyncSettings(
      { server: "ws://server:3030", enabled: true },
      { enabled: false },
    );
    expect(disabled).toEqual({ ok: true, value: { server: "ws://server:3030", enabled: false } });
    if (!disabled.ok) throw new Error(disabled.error.message);
    expect(updateRemoteSyncSettings(disabled.value, { enabled: true })).toEqual({
      ok: true,
      value: { server: "ws://server:3030", enabled: true },
    });
  });
  it("sets the initial URL with legacy default enablement and retains an existing disabled policy", () => {
    expect(
      updateRemoteSyncSettings({ enabled: false }, { server: "wss://host/native?mode=relay" }),
    ).toEqual({ ok: true, value: { server: "wss://host/native?mode=relay", enabled: true } });
    expect(
      updateRemoteSyncSettings(
        { server: "ws://old:3030", enabled: false },
        { server: "ws://new:3030" },
      ),
    ).toEqual({ ok: true, value: { server: "ws://new:3030", enabled: false } });
  });
  it.each([
    null,
    [],
    {},
    { unexpected: true },
    { enabled: "true" },
    { enabled: true },
    { server: "" },
    { server: 42 },
    { server: "http://host" },
    { server: "ws://host/#fragment" },
  ])("rejects invalid requests without modifying the original: %j", (input) => {
    const original = { enabled: false };
    expect(updateRemoteSyncSettings(original, input).ok).toBe(false);
    expect(original).toEqual({ enabled: false });
  });
});
