import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_CONFIG_FILE } from "@todu/core";
import type { DaemonConnectionManager } from "./daemon-connection-manager.js";

const execute = promisify(execFile);

interface DaemonStatus {
  state: string;
  healthy: boolean;
  startedAt: string | null;
}

export function createDaemonRestarter(options: {
  daemon: Pick<DaemonConnectionManager, "request">;
  appPath: string;
  packaged: boolean;
  resourcesPath: string;
  storagePath: string;
  socketPath: string;
}) {
  let pending: Promise<void> | null = null;
  async function restart() {
    const before = await options.daemon.request<DaemonStatus>("daemon.status", {});
    if (!before.ok || !before.value.startedAt)
      throw new Error("Cannot determine the current daemon's state. No restart was attempted.");
    const config = await options.daemon.request<{ configPath: string }>("sync.serverStatus", {});
    if (!config.ok || !config.value.configPath)
      throw new Error("Cannot determine the daemon configuration. No restart was attempted.");
    const configPath = path.resolve(config.value.configPath);
    const root = path.resolve(options.appPath, "../..");
    const env = {
      ...process.env,
      TODU_CONFIG: configPath,
      TODU_DATA_DIR: options.storagePath,
      TODU_DAEMON_SOCKET: options.socketPath,
    };
    const isDev =
      !options.packaged &&
      configPath === path.join(root, ".dev/config.yaml") &&
      options.socketPath === path.join(root, ".dev/data/daemon.sock") &&
      fs.existsSync(path.join(root, ".overmind.sock"));
    if (isDev) {
      await execute("overmind", ["restart", "-s", path.join(root, ".overmind.sock"), "daemon"], {
        env,
        timeout: 30_000,
      });
    } else {
      const cli = options.packaged
        ? path.join(
            options.resourcesPath,
            "cli",
            process.platform === "win32" ? "todu.exe" : "todu",
          )
        : path.join(root, "packages/cli/dist/index.js");
      if (!fs.existsSync(cli))
        throw new Error(
          "The matching Todu CLI is unavailable. Restart the daemon using its process manager.",
        );
      // Custom contexts must never delegate to a global user service belonging to another dataset.
      const lifecycleEnv = {
        ...env,
        ...(configPath !== DEFAULT_CONFIG_FILE || process.env.TODU_DAEMON_SOCKET
          ? { TODU_DAEMON_LIFECYCLE_MODE: "direct" }
          : {}),
      };
      const args = ["--config", configPath, "--format", "json", "daemon", "restart"];
      const result = options.packaged
        ? await execute(cli, args, { env: lifecycleEnv, timeout: 30_000 })
        : await execute(process.execPath, [cli, ...args], {
            env: { ...lifecycleEnv, ELECTRON_RUN_AS_NODE: "1" },
            timeout: 30_000,
          });
      const output = JSON.parse(result.stdout) as { ok?: boolean; message?: string };
      if (output.ok !== true) throw new Error(output.message ?? "Daemon restart failed");
    }
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const status = await options.daemon.request<DaemonStatus>(
        "daemon.status",
        {},
        { timeoutMs: 1000 },
      );
      if (
        status.ok &&
        status.value.healthy &&
        status.value.state === "running" &&
        status.value.startedAt &&
        status.value.startedAt !== before.value.startedAt
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(
      "Restart requested, but the daemon did not reconnect within 30 seconds. Check the daemon logs.",
    );
  }
  return () => {
    if (!pending)
      pending = restart().finally(() => {
        pending = null;
      });
    return pending;
  };
}
