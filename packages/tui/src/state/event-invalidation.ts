import type { QueryClient } from "@tanstack/react-query";
import type { TuiSyncStatus } from "../daemon/todu-client.js";
import { queryKeys } from "./query-keys.js";

export const reactiveDaemonEvents = ["data.changed", "sync.statusChanged"] as const;

export type ReactiveDaemonEvent = (typeof reactiveDaemonEvents)[number];

export function isReactiveDaemonEvent(event: string): event is ReactiveDaemonEvent {
  return (reactiveDaemonEvents as readonly string[]).includes(event);
}

export async function invalidateDataChangedQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["actors"] }),
    queryClient.invalidateQueries({ queryKey: ["projects"] }),
    queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    queryClient.invalidateQueries({ queryKey: ["notes"] }),
  ]);
}

export async function invalidateReconnectQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    invalidateDataChangedQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.syncStatus() }),
  ]);
}

export function applySyncStatusEvent(queryClient: QueryClient, payload: unknown): void {
  if (isTuiSyncStatus(payload)) {
    queryClient.setQueryData(queryKeys.syncStatus(), payload);
    return;
  }

  void queryClient.invalidateQueries({ queryKey: queryKeys.syncStatus() });
}

function isTuiSyncStatus(value: unknown): value is TuiSyncStatus {
  if (!isRecord(value)) {
    return false;
  }

  return isRecord(value.local) && isRecord(value.remote) && typeof value.remote.state === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
