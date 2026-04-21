import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export interface ResolveDaemonEntrypointPathOptions {
  isPackaged: boolean;
  appPath?: string;
  moduleDir?: string;
}

export interface CreateDaemonLaunchSpecOptions extends ResolveDaemonEntrypointPathOptions {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DaemonLaunchSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  entrypointPath: string;
}

export interface StartBundledDaemonOptions extends CreateDaemonLaunchSpecOptions {
  socketPath: string;
  cwd?: string;
  startupTimeoutMs?: number;
  spawnProcess?: typeof spawn;
}

export function resolveDaemonEntrypointPath(options: ResolveDaemonEntrypointPathOptions): string {
  if (options.isPackaged) {
    const appPath = options.appPath;
    if (!appPath) {
      throw new Error("Packaged daemon entrypoint resolution requires appPath");
    }

    return path.join(appPath, "dist", "daemon", "entrypoint.js");
  }

  return path.resolve(options.moduleDir ?? MODULE_DIR, "../../../daemon/src/entrypoint.ts");
}

export function createDaemonLaunchSpec(options: CreateDaemonLaunchSpecOptions): DaemonLaunchSpec {
  const entrypointPath = resolveDaemonEntrypointPath(options);
  const command = options.execPath ?? process.execPath;
  const env = {
    ...(options.env ?? process.env),
  };

  if (options.isPackaged) {
    return {
      command,
      args: [entrypointPath],
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      entrypointPath,
    };
  }

  return {
    command,
    args: [resolveTsxCliPath(options.moduleDir), entrypointPath],
    env,
    entrypointPath,
  };
}

export async function startBundledDaemonProcess(
  options: StartBundledDaemonOptions,
): Promise<ChildProcess> {
  const spec = createDaemonLaunchSpec(options);
  const child = (options.spawnProcess ?? spawn)(spec.command, spec.args, {
    cwd: options.cwd ?? resolveDaemonLaunchCwd(options),
    detached: true,
    env: {
      ...spec.env,
      TODU_DAEMON_SOCKET: options.socketPath,
      TODUAI_DAEMON_SOCKET: options.socketPath,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  try {
    await waitForSocket(options.socketPath, child, options.startupTimeoutMs ?? 5_000, () => stderr);
    child.unref();
    child.stderr?.destroy();
    return child;
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(
      `Failed to start bundled daemon from ${spec.entrypointPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function resolveTsxCliPath(moduleDir = MODULE_DIR): string {
  return path.resolve(moduleDir, "../../../../node_modules/tsx/dist/cli.mjs");
}

function resolveDaemonLaunchCwd(options: ResolveDaemonEntrypointPathOptions): string {
  if (options.isPackaged) {
    return path.dirname(options.appPath ?? process.cwd());
  }

  return path.resolve(options.moduleDir ?? MODULE_DIR, "../../../..");
}

async function waitForSocket(
  socketPath: string,
  child: ChildProcess,
  timeoutMs: number,
  getStderr: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(socketPath)) {
      return;
    }

    if (child.exitCode !== null) {
      throw new Error(`daemon exited early with code ${child.exitCode}: ${getStderr()}`);
    }

    await sleep(50);
  }

  throw new Error(`timed out waiting for daemon socket: ${socketPath}\n${getStderr()}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
