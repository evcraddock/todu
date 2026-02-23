import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface DaemonHandle {
  stop(reason?: string): Promise<void>;
}

export async function startDaemonForTests(
  rootDir: string,
  storagePath: string,
): Promise<DaemonHandle> {
  const daemonEntrypoint = path.resolve(rootDir, "packages/daemon/dist/entrypoint.js");
  const socketPath = path.join(storagePath, "daemon.sock");
  const daemonProcess = spawn("node", [daemonEntrypoint], {
    cwd: rootDir,
    env: { ...process.env, TODUAI_DATA_DIR: storagePath },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  daemonProcess.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(socketPath)) {
      return {
        stop: async () => {
          await stopProcess(daemonProcess);
        },
      };
    }

    if (daemonProcess.exitCode !== null) {
      throw new Error(`Daemon exited early with code ${daemonProcess.exitCode}: ${stderr}`);
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
    }, 3000);

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
