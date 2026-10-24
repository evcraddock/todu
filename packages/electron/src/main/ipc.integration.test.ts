import { describe, expect, it, vi } from "vitest";
import { createDaemonIpcHandlers, mapDaemonErrorToToduError } from "./ipc.js";

describe("createDaemonIpcHandlers", () => {
  it("routes actor IPC handlers to daemon RPC and preserves Result contract", async () => {
    const daemon = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          value: [{ id: "actor-user", displayName: "user" }],
        })
        .mockResolvedValueOnce({
          ok: true,
          value: { id: "actor-reviewer", displayName: "Reviewer" },
        }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const listResult = await handlers["todu:actor:list"](undefined);
    const createResult = await handlers["todu:actor:create"](undefined, {
      id: "actor-reviewer",
      displayName: "Reviewer",
    });

    expect(daemon.request).toHaveBeenNthCalledWith(1, "actor.list", {});
    expect(daemon.request).toHaveBeenNthCalledWith(2, "actor.create", {
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

  it("routes task IPC handlers to daemon RPC and preserves Result contract", async () => {
    const daemon = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: { id: "task-1", title: "Demo" },
      }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const result = await handlers["todu:task:get"](undefined, "task-1");

    expect(daemon.request).toHaveBeenCalledWith("task.get", { id: "task-1" });
    expect(result).toEqual({
      ok: true,
      value: { id: "task-1", title: "Demo" },
    });
  });

  it("routes note IPC handlers to daemon RPC and preserves Result contract", async () => {
    const daemon = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: { id: "note-1", content: "Captured" },
      }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const result = await handlers["todu:note:get"](undefined, "note-1");

    expect(daemon.request).toHaveBeenCalledWith("note.get", { id: "note-1" });
    expect(result).toEqual({
      ok: true,
      value: { id: "note-1", content: "Captured" },
    });
  });

  it("routes approval IPC handlers to daemon RPC and preserves Result contract", async () => {
    const daemon = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          value: [{ kind: "taskDescription", taskId: "task-1", contentPreview: "Imported task" }],
        })
        .mockResolvedValueOnce({
          ok: true,
          value: { kind: "taskDescription", taskId: "task-1", contentPreview: "Imported task" },
        })
        .mockResolvedValueOnce({
          ok: true,
          value: { kind: "noteContent", noteId: "note-1", contentPreview: "Imported note" },
        }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const listResult = await handlers["todu:approval:list"](undefined);
    const taskResult = await handlers["todu:approval:approve-task-description"](
      undefined,
      "task-1",
    );
    const noteResult = await handlers["todu:approval:approve-note-content"](undefined, "note-1");

    expect(daemon.request).toHaveBeenNthCalledWith(1, "approval.list", { filter: undefined });
    expect(daemon.request).toHaveBeenNthCalledWith(2, "approval.approveTaskDescription", {
      taskId: "task-1",
    });
    expect(daemon.request).toHaveBeenNthCalledWith(3, "approval.approveNoteContent", {
      noteId: "note-1",
    });
    expect(listResult).toEqual({
      ok: true,
      value: [{ kind: "taskDescription", taskId: "task-1", contentPreview: "Imported task" }],
    });
    expect(taskResult).toEqual({
      ok: true,
      value: { kind: "taskDescription", taskId: "task-1", contentPreview: "Imported task" },
    });
    expect(noteResult).toEqual({
      ok: true,
      value: { kind: "noteContent", noteId: "note-1", contentPreview: "Imported note" },
    });
  });

  it("maps daemon NOT_FOUND errors to renderer-consumable not-found Result errors", async () => {
    const daemon = {
      request: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "task not found: task-999",
          details: {
            entity: "task",
            id: "task-999",
          },
        },
      }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const result = await handlers["todu:task:get"](undefined, "task-999");

    expect(result).toEqual({
      ok: false,
      error: {
        type: "not-found",
        entity: "task",
        id: "task-999",
      },
    });
  });

  it("returns raw sync status payload for sync IPC contracts", async () => {
    const syncStatus = {
      local: { mode: "authority" },
      remote: { state: "connected" as const, server: "ws://localhost:3030" },
    };

    const daemon = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: syncStatus,
      }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const result = await handlers["todu:sync:status"](undefined);

    expect(daemon.request).toHaveBeenCalledWith("sync.status", {});
    expect(result).toEqual(syncStatus);
  });

  it.each([
    ["todu:sync:daemon-status", "daemon.status", { state: "running", healthy: true }],
    ["todu:sync:devices", "device.list", [{ id: "local-device", name: "Laptop" }]],
    [
      "todu:sync:server-status",
      "sync.serverStatus",
      { enabled: false, running: false, state: "disconnected" },
    ],
  ])("forwards %s as a read-only daemon request", async (channel, method, value) => {
    const daemon = { request: vi.fn().mockResolvedValue({ ok: true, value }) };
    const handlers = createDaemonIpcHandlers({ daemon, storagePath: "/tmp/todu-ipc-test" });
    expect(await handlers[channel as string](undefined)).toEqual(value);
    expect(daemon.request).toHaveBeenCalledWith(method, {});
  });

  it("forwards server settings to the daemon for persistence and application", async () => {
    const value = {
      server: "wss://sync.example.com",
      enabled: true,
      running: true,
      state: "disconnected",
    };
    const daemon = { request: vi.fn().mockResolvedValue({ ok: true, value }) };
    const handlers = createDaemonIpcHandlers({ daemon, storagePath: "/tmp/todu-ipc-test" });
    const settings = { server: value.server, enabled: true };
    expect(await handlers["todu:sync:configure-server"](undefined, settings)).toEqual(value);
    expect(daemon.request).toHaveBeenCalledWith("sync.serverConfigure", { settings });
  });

  it("invokes the injected daemon lifecycle restart", async () => {
    const restartDaemon = vi.fn().mockResolvedValue(undefined);
    const handlers = createDaemonIpcHandlers({
      daemon: { request: vi.fn() },
      storagePath: "/tmp/todu-ipc-test",
      restartDaemon,
    });
    await handlers["todu:sync:restart-daemon"](undefined);
    expect(restartDaemon).toHaveBeenCalledOnce();
  });

  it.each([
    ["enroll", "sync.enroll", "http://peer:24377", { endpoint: "http://peer:24377" }],
    ["enrollment-status", "sync.enrollmentStatus", undefined, {}],
    ["enrollment-cancel", "sync.enrollmentCancel", undefined, {}],
    ["enrollment-requests", "sync.enrollmentRequests", undefined, {}],
    ["enrollment-approve", "sync.enrollmentApprove", "request-id", { requestId: "request-id" }],
    ["enrollment-deny", "sync.enrollmentDeny", "request-id", { requestId: "request-id" }],
  ])(
    "forwards %s through the daemon's enrollment API",
    async (channel, method, argument, params) => {
      const daemon = {
        request: vi.fn().mockResolvedValue({ ok: true, value: { stage: "pending" } }),
      };
      const handlers = createDaemonIpcHandlers({ daemon, storagePath: "/tmp/todu-ipc-test" });
      await handlers[`todu:sync:${channel}`](undefined, argument);
      expect(daemon.request).toHaveBeenCalledWith(method, params);
    },
  );

  it("invokes daemon sync.join for join-check", async () => {
    const daemon = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "check",
          previousCatalogId: "catalog-a",
          targetCatalogId: "catalog-b",
          switched: false,
          rolledBack: false,
        },
      }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const result = await handlers["todu:sync:join-check"](undefined, "catalog-b");

    expect(daemon.request).toHaveBeenCalledWith("sync.join", {
      catalogId: "catalog-b",
      check: true,
    });
    expect(result).toEqual({
      mode: "check",
      previousCatalogId: "catalog-a",
      targetCatalogId: "catalog-b",
      switched: false,
      rolledBack: false,
    });
  });

  it("invokes daemon sync.join for transactional join", async () => {
    const daemon = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mode: "join",
          previousCatalogId: "catalog-a",
          targetCatalogId: "catalog-b",
          switched: true,
          rolledBack: false,
        },
      }),
    };

    const handlers = createDaemonIpcHandlers({
      daemon,
      storagePath: "/tmp/todu-ipc-test",
    });

    const result = await handlers["todu:sync:join"](undefined, "catalog-b");

    expect(daemon.request).toHaveBeenCalledWith("sync.join", {
      catalogId: "catalog-b",
    });
    expect(result).toEqual({
      mode: "join",
      previousCatalogId: "catalog-a",
      targetCatalogId: "catalog-b",
      switched: true,
      rolledBack: false,
    });
  });
});

describe("mapDaemonErrorToToduError", () => {
  it("maps BAD_REQUEST to validation error shape", () => {
    const mapped = mapDaemonErrorToToduError("task.update", {
      code: "BAD_REQUEST",
      message: "task.update requires params.input",
      details: {
        field: "input",
      },
    });

    expect(mapped).toEqual({
      type: "validation",
      field: "input",
      message: "task.update requires params.input",
    });
  });

  it("maps infrastructure errors to storage error shape", () => {
    const mapped = mapDaemonErrorToToduError("task.list", {
      code: "DAEMON_UNAVAILABLE",
      message: "Daemon unavailable at socket: /tmp/todu.sock",
    });

    expect(mapped).toEqual({
      type: "storage",
      message:
        "task.list failed (DAEMON_UNAVAILABLE): Daemon unavailable at socket: /tmp/todu.sock",
    });
  });
});
