import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  applySyncStatusEvent,
  invalidateDataChangedQueries,
  invalidateReconnectQueries,
  isReactiveDaemonEvent,
} from "./event-invalidation.js";
import { queryKeys } from "./query-keys.js";

describe("event invalidation", () => {
  it("recognizes daemon events used by the TUI", () => {
    expect(isReactiveDaemonEvent("data.changed")).toBe(true);
    expect(isReactiveDaemonEvent("sync.statusChanged")).toBe(true);
    expect(isReactiveDaemonEvent("other.event")).toBe(false);
  });

  it("invalidates domain queries on data.changed", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateDataChangedQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["actors"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notes"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["habits"] });
  });

  it("invalidates domain and sync queries on reconnect", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateReconnectQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.syncStatus() });
  });

  it("applies sync.statusChanged payloads to the sync query cache", () => {
    const queryClient = new QueryClient();
    const status = { local: { mode: "standalone" }, remote: { state: "connected" } };

    applySyncStatusEvent(queryClient, status);

    expect(queryClient.getQueryData(queryKeys.syncStatus())).toEqual(status);
  });
});
