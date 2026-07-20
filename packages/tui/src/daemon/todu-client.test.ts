import { describe, expect, it, vi } from "vitest";
import type { DaemonConnection } from "./connection.js";
import {
  createTuiToduClient,
  formatToduClientError,
  invokeDaemonValue,
  TuiToduClientError,
} from "./todu-client.js";

function createMockDaemon(request: ReturnType<typeof vi.fn>): Pick<DaemonConnection, "request"> {
  return { request };
}

describe("createTuiToduClient", () => {
  it("maps project methods to daemon RPC params", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: [{ id: "project-1", name: "Inbox" }] })
      .mockResolvedValueOnce({ ok: true, value: { id: "project-1", name: "Inbox" } });
    const client = createTuiToduClient(createMockDaemon(request));

    await expect(client.project.list({ status: "active" })).resolves.toEqual([
      { id: "project-1", name: "Inbox" },
    ]);
    await expect(client.project.get("project-1")).resolves.toEqual({
      id: "project-1",
      name: "Inbox",
    });

    expect(request).toHaveBeenNthCalledWith(1, "project.list", { filter: { status: "active" } });
    expect(request).toHaveBeenNthCalledWith(2, "project.get", { id: "project-1" });
  });

  it("maps task methods to daemon RPC params", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: [{ id: "task-1", title: "Ship" }] })
      .mockResolvedValueOnce({ ok: true, value: { id: "task-1", title: "Ship" } })
      .mockResolvedValueOnce({ ok: true, value: { id: "task-1", title: "Ship it" } });
    const client = createTuiToduClient(createMockDaemon(request));

    await client.task.list({ projectId: "project-1" }, { field: "title", direction: "asc" });
    await client.task.get("task-1");
    await client.task.update("task-1", { title: "Ship it" });

    expect(request).toHaveBeenNthCalledWith(1, "task.list", {
      filter: { projectId: "project-1" },
      sort: { field: "title", direction: "asc" },
    });
    expect(request).toHaveBeenNthCalledWith(2, "task.get", { id: "task-1" });
    expect(request).toHaveBeenNthCalledWith(3, "task.update", {
      id: "task-1",
      input: { title: "Ship it" },
    });
  });

  it("maps task comments to note.create", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      value: { id: "note-1", content: "Looks good", entityType: "task", entityId: "task-1" },
    });
    const client = createTuiToduClient(createMockDaemon(request));

    await client.task.createComment("task-1", "Looks good");

    expect(request).toHaveBeenCalledWith("note.create", {
      input: {
        content: "Looks good",
        entityType: "task",
        entityId: "task-1",
      },
    });
  });

  it("maps habit list and check-in methods to daemon RPC params", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: [{ id: "hab-1", title: "Meditate" }] })
      .mockResolvedValueOnce({
        ok: true,
        value: { date: "2026-07-20", completed: true },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { date: "2026-07-20", completed: false },
      });
    const client = createTuiToduClient(createMockDaemon(request));

    await client.habit.list({ paused: false, checkedToday: true });
    await client.habit.check("hab-1");
    await client.habit.uncheck("hab-1");

    expect(request).toHaveBeenNthCalledWith(1, "habit.list", {
      filter: { paused: false, checkedToday: true },
    });
    expect(request).toHaveBeenNthCalledWith(2, "habit.check", { id: "hab-1" });
    expect(request).toHaveBeenNthCalledWith(3, "habit.uncheck", { id: "hab-1" });
  });

  it("maps actor, note, and sync status methods", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValueOnce({
        ok: true,
        value: { local: { mode: "standalone" }, remote: { state: "disconnected" } },
      });
    const client = createTuiToduClient(createMockDaemon(request));

    await client.actor.list();
    await client.note.list({ entityType: "task", entityId: "task-1" });
    await client.sync.status();

    expect(request).toHaveBeenNthCalledWith(1, "actor.list", {});
    expect(request).toHaveBeenNthCalledWith(2, "note.list", {
      filter: { entityType: "task", entityId: "task-1" },
    });
    expect(request).toHaveBeenNthCalledWith(3, "sync.status", {});
  });

  it("throws user-facing mapped errors instead of raw protocol frames", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "task not found",
        details: { entity: "task", id: "task-9" },
      },
    });

    await expect(
      invokeDaemonValue(createMockDaemon(request), "task.get", { id: "task-9" }),
    ).rejects.toMatchObject({
      userMessage: "task not found: task-9",
      method: "task.get",
      code: "NOT_FOUND",
    });
  });

  it("formats daemon unavailable errors for users", () => {
    const error = new TuiToduClientError({
      method: "project.list",
      code: "DAEMON_UNAVAILABLE",
      message: "project.list failed (DAEMON_UNAVAILABLE): socket missing",
      userMessage: "Daemon unavailable. Start it with: todu daemon start.",
    });

    expect(formatToduClientError(error)).toBe(
      "Daemon unavailable. Start it with: todu daemon start.",
    );
  });
});
