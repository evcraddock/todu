import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDaemonLaunchSpec,
  resolveDaemonEntrypointPath,
  startBundledDaemonProcess,
} from "./daemon-runtime.js";

describe("resolveDaemonEntrypointPath", () => {
  it("resolves packaged daemon entrypoint inside the app bundle", () => {
    expect(
      resolveDaemonEntrypointPath({
        isPackaged: true,
        appPath: "/Applications/todu.app/Contents/Resources/app.asar",
      }),
    ).toBe("/Applications/todu.app/Contents/Resources/app.asar/dist/daemon/entrypoint.js");
  });

  it("resolves dev daemon entrypoint from the workspace source tree", () => {
    expect(resolveDaemonEntrypointPath({ isPackaged: false })).toMatch(
      /packages[\\/]daemon[\\/]src[\\/]entrypoint\.ts$/,
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDaemonLaunchSpec", () => {
  it("uses tsx to launch the daemon source entrypoint in dev mode", () => {
    const spec = createDaemonLaunchSpec({
      isPackaged: false,
      execPath: "/usr/local/bin/node",
      env: { TEST_ENV: "1" },
    });

    expect(spec.command).toBe("/usr/local/bin/node");
    expect(spec.args[0]).toMatch(/node_modules[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    expect(spec.args[1]).toMatch(/packages[\\/]daemon[\\/]src[\\/]entrypoint\.ts$/);
    expect(spec.env.TEST_ENV).toBe("1");
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it("uses the packaged daemon entrypoint with ELECTRON_RUN_AS_NODE in packaged mode", () => {
    const spec = createDaemonLaunchSpec({
      isPackaged: true,
      appPath: "/opt/todu/resources/app.asar",
      execPath: "/opt/todu/todu",
      env: { TEST_ENV: "1" },
    });

    expect(spec.command).toBe("/opt/todu/todu");
    expect(spec.args).toEqual(["/opt/todu/resources/app.asar/dist/daemon/entrypoint.js"]);
    expect(spec.env.TEST_ENV).toBe("1");
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("passes packaged launch settings through to the spawned daemon process", async () => {
    const socketPath = "/tmp/todu-electron-daemon.sock";
    const stderr = createMockReadable();
    const mockChild = {
      exitCode: null,
      stderr,
      kill: vi.fn(),
      unref: vi.fn(),
    } as unknown as ChildProcess;
    const spawnProcess = vi.fn().mockReturnValue(mockChild);

    queueSocketExists(socketPath, [false, true]);

    await startBundledDaemonProcess({
      isPackaged: true,
      appPath: "/opt/todu/resources/app.asar",
      execPath: "/opt/todu/todu",
      socketPath,
      spawnProcess,
      env: { TEST_ENV: "1" },
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      "/opt/todu/todu",
      ["/opt/todu/resources/app.asar/dist/daemon/entrypoint.js"],
      expect.objectContaining({
        detached: true,
        cwd: "/opt/todu/resources",
        stdio: ["ignore", "ignore", "pipe"],
        env: expect.objectContaining({
          TEST_ENV: "1",
          ELECTRON_RUN_AS_NODE: "1",
          TODU_DAEMON_SOCKET: socketPath,
          TODUAI_DAEMON_SOCKET: socketPath,
        }),
      }),
    );
    expect(mockChild.unref).toHaveBeenCalled();
  });

  it("starts the daemon from the dev launch spec without a global daemon install", async () => {
    const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "todu-electron-daemon-runtime-"));
    const socketPath = path.join(storagePath, "daemon.sock");

    const child = await startBundledDaemonProcess({
      isPackaged: false,
      execPath: process.execPath,
      socketPath,
      env: {
        ...process.env,
        TODU_CONFIG: "",
        TODUAI_CONFIG: "",
        TODU_DATA_DIR: storagePath,
      },
    });

    try {
      expect(fs.existsSync(socketPath)).toBe(true);
    } finally {
      await stopProcess(child);
    }
  }, 15_000);
});

async function stopProcess(processHandle: ChildProcess): Promise<void> {
  if (processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (processHandle.exitCode === null) {
        processHandle.kill("SIGKILL");
      }
      resolve();
    }, 3_000);

    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function createMockReadable(): NodeJS.ReadableStream {
  return {
    destroy() {},
    on() {
      return this;
    },
  } as NodeJS.ReadableStream;
}

function queueSocketExists(socketPath: string, states: boolean[]): void {
  const originalExistsSync = fs.existsSync.bind(fs);
  vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
    if (candidate === socketPath) {
      return states.shift() ?? true;
    }

    return originalExistsSync(candidate);
  });
}
