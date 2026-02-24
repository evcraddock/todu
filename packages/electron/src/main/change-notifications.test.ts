import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  buildReconnectRefreshEvents,
  DAEMON_REACTIVE_EVENTS,
  dispatchRendererEvent,
  mapDaemonEventToRendererEvent,
  subscribeRendererToDaemonEvents,
} from "./change-notifications.js";

describe("change notifications", () => {
  it("subscribes to daemon data and sync status events", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      value: { subscribed: [...DAEMON_REACTIVE_EVENTS] },
    });

    await subscribeRendererToDaemonEvents({ request });

    expect(request).toHaveBeenCalledWith("events.subscribe", {
      events: [...DAEMON_REACTIVE_EVENTS],
    });
  });

  it("throws if event subscription fails", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "DAEMON_UNAVAILABLE",
        message: "socket missing",
      },
    });

    await expect(subscribeRendererToDaemonEvents({ request })).rejects.toThrow(
      "events.subscribe failed (DAEMON_UNAVAILABLE): socket missing",
    );
  });

  it("maps daemon event frames to renderer channels", () => {
    expect(mapDaemonEventToRendererEvent({ event: "data.changed", payload: {} })).toEqual({
      channel: "todu:data:changed",
      payload: { type: "catalog" },
    });

    const statusPayload = {
      local: { mode: "authority" },
      remote: { state: "connected" as const, server: "ws://localhost:3030" },
    };
    expect(
      mapDaemonEventToRendererEvent({ event: "sync.statusChanged", payload: statusPayload }),
    ).toEqual({
      channel: "todu:sync:status-changed",
      payload: statusPayload,
    });

    expect(mapDaemonEventToRendererEvent({ event: "worker.changed", payload: {} })).toBeNull();
  });

  it("builds reconnect refresh events with best-effort sync status refresh", async () => {
    const statusPayload = {
      local: { mode: "authority" },
      remote: { state: "connected" as const, server: "ws://localhost:3030" },
    };

    const request = vi.fn().mockResolvedValue({ ok: true, value: statusPayload });

    const refreshEvents = await buildReconnectRefreshEvents({ request });

    expect(request).toHaveBeenCalledWith("sync.status", {});
    expect(refreshEvents).toEqual([
      { channel: "todu:data:changed", payload: { type: "catalog" } },
      { channel: "todu:sync:status-changed", payload: statusPayload },
    ]);
  });

  it("keeps reconnect refresh best-effort when sync.status fails", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "TIMEOUT", message: "request timed out" },
    });

    const refreshEvents = await buildReconnectRefreshEvents({ request });

    expect(refreshEvents).toEqual([{ channel: "todu:data:changed", payload: { type: "catalog" } }]);
  });

  it("dispatches renderer events only when window is available", () => {
    const send = vi.fn();
    const activeWindow = {
      isDestroyed: () => false,
      webContents: {
        send,
      },
    } as unknown as BrowserWindow;

    dispatchRendererEvent(activeWindow, {
      channel: "todu:data:changed",
      payload: { type: "catalog" },
    });
    expect(send).toHaveBeenCalledWith("todu:data:changed", { type: "catalog" });

    const destroyedWindow = {
      isDestroyed: () => true,
      webContents: {
        send,
      },
    } as unknown as BrowserWindow;

    dispatchRendererEvent(destroyedWindow, {
      channel: "todu:sync:status-changed",
      payload: { remote: { state: "disconnected" } },
    });
    dispatchRendererEvent(null, {
      channel: "todu:sync:status-changed",
      payload: { remote: { state: "disconnected" } },
    });

    expect(send).toHaveBeenCalledTimes(1);
  });
});
