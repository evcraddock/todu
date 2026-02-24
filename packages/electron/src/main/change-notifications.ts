import type { SyncStatus } from "@todu/engine";
import type { BrowserWindow } from "electron";
import type { DaemonConnectionResult, DaemonEventFrame } from "./daemon-connection-manager.js";

export const DAEMON_REACTIVE_EVENTS = ["data.changed", "sync.statusChanged"] as const;

interface DaemonRequester {
  request<T>(method: string, params?: Record<string, unknown>): Promise<DaemonConnectionResult<T>>;
}

export interface RendererEvent {
  channel: "todu:data:changed" | "todu:sync:status-changed";
  payload: unknown;
}

/**
 * Subscribe Electron renderer reactivity channels to daemon event streams.
 */
export async function subscribeRendererToDaemonEvents(requester: DaemonRequester): Promise<void> {
  const subscribe = await requester.request<{ subscribed: string[] }>("events.subscribe", {
    events: [...DAEMON_REACTIVE_EVENTS],
  });

  if (!subscribe.ok) {
    throw new Error(
      `events.subscribe failed (${subscribe.error.code}): ${subscribe.error.message}`,
    );
  }
}

/**
 * Map daemon event frames into existing renderer IPC channels.
 */
export function mapDaemonEventToRendererEvent(event: DaemonEventFrame): RendererEvent | null {
  if (event.event === "data.changed") {
    return {
      channel: "todu:data:changed",
      payload: { type: "catalog" },
    };
  }

  if (event.event === "sync.statusChanged") {
    return {
      channel: "todu:sync:status-changed",
      payload: event.payload,
    };
  }

  return null;
}

/**
 * Reconnect refresh strategy for best-effort daemon event delivery.
 *
 * We force a renderer data invalidation event and attempt to refresh sync
 * status snapshot. If sync.status fails, we keep going with data refresh only.
 */
export async function buildReconnectRefreshEvents(
  requester: DaemonRequester,
): Promise<RendererEvent[]> {
  const events: RendererEvent[] = [
    {
      channel: "todu:data:changed",
      payload: { type: "catalog" },
    },
  ];

  const status = await requester.request<SyncStatus>("sync.status", {});
  if (status.ok) {
    events.push({
      channel: "todu:sync:status-changed",
      payload: status.value,
    });
  }

  return events;
}

export function dispatchRendererEvent(
  mainWindow: BrowserWindow | null,
  event: RendererEvent,
): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(event.channel, event.payload);
}
