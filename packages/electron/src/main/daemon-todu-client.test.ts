import { describe, expect, it, vi } from "vitest";
import { createDaemonToduClient } from "./daemon-todu-client.js";

describe("createDaemonToduClient", () => {
  it("routes actor methods to daemon RPC and preserves Result shape", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "actor-user", displayName: "user" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "actor-reviewer", displayName: "Reviewer" },
      });

    const client = createDaemonToduClient({ request });

    const listResult = await client.actor.list();
    const createResult = await client.actor.create({
      id: "actor-reviewer",
      displayName: "Reviewer",
    });

    expect(request).toHaveBeenNthCalledWith(1, "actor.list", {});
    expect(request).toHaveBeenNthCalledWith(2, "actor.create", {
      input: {
        id: "actor-reviewer",
        displayName: "Reviewer",
      },
    });
    expect(listResult).toEqual({
      ok: true,
      value: [{ id: "actor-user", displayName: "user" }],
    });
    expect(createResult).toEqual({
      ok: true,
      value: { id: "actor-reviewer", displayName: "Reviewer" },
    });
  });

  it("routes task.list to daemon RPC and preserves Result shape", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      value: [{ id: "task-1", title: "Demo", status: "active" }],
    });

    const client = createDaemonToduClient({ request });

    const result = await client.task.list({ status: ["active"] }, { field: "title" });

    expect(request).toHaveBeenCalledWith("task.list", {
      filter: { status: ["active"] },
      sort: { field: "title" },
    });
    expect(result).toEqual({
      ok: true,
      value: [{ id: "task-1", title: "Demo", status: "active" }],
    });
  });

  it("maps daemon NOT_FOUND errors to not-found ToduError", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "task not found: task-9",
        details: {
          entity: "task",
          id: "task-9",
        },
      },
    });

    const client = createDaemonToduClient({ request });

    const result = await client.task.get("task-9");

    expect(result).toEqual({
      ok: false,
      error: {
        type: "not-found",
        entity: "task",
        id: "task-9",
      },
    });
  });

  it("maps daemon transport errors to storage ToduError", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "DAEMON_UNAVAILABLE",
        message: "socket missing",
      },
    });

    const client = createDaemonToduClient({ request });

    const result = await client.project.list();

    expect(result).toEqual({
      ok: false,
      error: {
        type: "storage",
        message: "project.list failed (DAEMON_UNAVAILABLE): socket missing",
      },
    });
  });
});
