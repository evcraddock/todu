import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CATALOG_DOC_KEY } from "@todu/core";
import { describe, expect, it, vi } from "vitest";
import { createDaemonIpcHandlers, mapDaemonErrorToToduError } from "./ipc.js";

describe("createDaemonIpcHandlers", () => {
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
      appLifecycle: {
        relaunch: vi.fn(),
        exit: vi.fn(),
      },
    });

    const result = await handlers["todu:task:get"](undefined, "task-1");

    expect(daemon.request).toHaveBeenCalledWith("task.get", { id: "task-1" });
    expect(result).toEqual({
      ok: true,
      value: { id: "task-1", title: "Demo" },
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
      appLifecycle: {
        relaunch: vi.fn(),
        exit: vi.fn(),
      },
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
      appLifecycle: {
        relaunch: vi.fn(),
        exit: vi.fn(),
      },
    });

    const result = await handlers["todu:sync:status"](undefined);

    expect(daemon.request).toHaveBeenCalledWith("sync.status", {});
    expect(result).toEqual(syncStatus);
  });

  it("writes join marker and requests relaunch for valid join code", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-ipc-join-test-"));
    const relaunch = vi.fn();
    const exit = vi.fn();

    const handlers = createDaemonIpcHandlers({
      daemon: {
        request: vi.fn(),
      },
      storagePath: tmpDir,
      appLifecycle: {
        relaunch,
        exit,
      },
    });

    const catalogId = "2sFuwGcFcU9fkQDnYCdveNPoF6nK";

    await handlers["todu:sync:join"](undefined, catalogId);

    const markerPath = path.join(tmpDir, `${CATALOG_DOC_KEY}.id`);
    expect(fs.readFileSync(markerPath, "utf-8")).toBe(catalogId);
    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
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
