import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDaemonLaunchSpec, resolveDaemonEntrypointPath } from "./daemon-runtime.js";

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

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

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

  it("starts the daemon from the dev launch spec without a global daemon install", async () => {
    const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "todu-electron-daemon-runtime-"));
    const socketPath = path.join(storagePath, "daemon.sock");
    const spec = createDaemonLaunchSpec({
      isPackaged: false,
      execPath: process.execPath,
      env: {
        ...process.env,
        TODU_CONFIG: "",
        TODUAI_CONFIG: "",
        TODU_DATA_DIR: storagePath,
        TODU_DAEMON_SOCKET: socketPath,
        TODUAI_DAEMON_SOCKET: socketPath,
      },
    });

    const child = spawn(spec.command, spec.args, {
      cwd: path.resolve(TEST_DIR, "../../../.."),
      env: spec.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    try {
      await waitForSocket(socketPath, child, stderr);
      expect(fs.existsSync(socketPath)).toBe(true);
    } finally {
      await stopProcess(child);
    }
  }, 15_000);
});

async function waitForSocket(
  socketPath: string,
  child: ReturnType<typeof spawn>,
  stderr: string,
): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(socketPath)) {
      return;
    }

    if (child.exitCode !== null) {
      throw new Error(`Daemon exited early with code ${child.exitCode}: ${stderr}`);
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for daemon socket: ${socketPath}\n${stderr}`);
}

async function stopProcess(processHandle: ReturnType<typeof spawn>): Promise<void> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
