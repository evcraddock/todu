import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonRestarter } from "./daemon-restart.js";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: execute }),
  };
});

describe("daemon restart", () => {
  let root: string;
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue({ stdout: '{"ok":true}', stderr: "" });
    root = fs.mkdtempSync(path.join(os.tmpdir(), "todu-desktop-restart-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function setup() {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { startedAt: "before", state: "running", healthy: true },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { configPath: path.join(root, ".dev/config.yaml") },
      })
      .mockResolvedValue({
        ok: true,
        value: { startedAt: "after", state: "running", healthy: true },
      });
    const restart = createDaemonRestarter({
      daemon: { request },
      appPath: path.join(root, "packages/electron"),
      packaged: false,
      resourcesPath: root,
      storagePath: path.join(root, ".dev/data"),
      socketPath: path.join(root, ".dev/data/daemon.sock"),
    });
    return { restart, request };
  }

  it("restarts only the isolated Overmind daemon and waits for a new healthy instance", async () => {
    fs.writeFileSync(path.join(root, ".overmind.sock"), "");
    const { restart, request } = setup();
    const pending = restart();
    expect(restart()).toBe(pending);
    await pending;
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      "overmind",
      ["restart", "-s", path.join(root, ".overmind.sock"), "daemon"],
      expect.objectContaining({
        env: expect.objectContaining({
          TODU_CONFIG: path.join(root, ".dev/config.yaml"),
          TODU_DAEMON_SOCKET: path.join(root, ".dev/data/daemon.sock"),
        }),
      }),
    );
    expect(request).toHaveBeenLastCalledWith("daemon.status", {}, { timeoutMs: 1000 });
  });

  it("does not restart if the current daemon cannot be identified", async () => {
    const { restart, request } = setup();
    request.mockReset().mockResolvedValue({ ok: false, error: { message: "offline" } });
    await expect(restart()).rejects.toThrow("No restart was attempted");
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports a supervisor failure without claiming reconnection", async () => {
    fs.writeFileSync(path.join(root, ".overmind.sock"), "");
    execute.mockRejectedValue(new Error("Overmind unavailable"));
    const { restart, request } = setup();
    await expect(restart()).rejects.toThrow("Overmind unavailable");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("forces direct lifecycle for a custom config rather than restarting a global service", async () => {
    fs.mkdirSync(path.join(root, "packages/cli/dist"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages/cli/dist/index.js"), "");
    await setup().restart();
    expect(execute).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(["daemon", "restart"]),
      expect.objectContaining({
        env: expect.objectContaining({
          TODU_DAEMON_LIFECYCLE_MODE: "direct",
          ELECTRON_RUN_AS_NODE: "1",
        }),
      }),
    );
  });
});
