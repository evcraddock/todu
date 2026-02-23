import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveRemoteSyncConfig } from "@todu/core";
import type { Command } from "commander";
import { getConfigPath, loadConfig, resolveDataDir } from "../config.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON } from "../format.js";

interface DaemonStatusResult {
  role: "node" | "authority";
  state: "stopped" | "starting" | "running" | "stopping";
  healthy: boolean;
  startedAt: string | null;
  transport: {
    kind: "uds";
    path: string;
    mode: number;
  } | null;
  catalog: {
    id: string | null;
  };
}

interface DaemonStatusOutput {
  running: boolean;
  status?: DaemonStatusResult;
  reason?: string;
}

export function registerDaemonCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const daemon = program.command("daemon").description("Manage local daemon lifecycle");

  daemon
    .command("run")
    .description("Run local daemon in foreground mode")
    .action(async () => {
      const configOpt = program.opts().config as string | undefined;
      const configPath = getConfigPath(configOpt);
      const fileConfig = loadConfig(configPath);
      const storagePath = resolveDataDir(configPath, fileConfig);
      const remoteSync = resolveRemoteSyncConfig(fileConfig);

      const daemonEntrypoint = resolveDaemonEntrypoint();
      if (!fs.existsSync(daemonEntrypoint)) {
        console.error(`Error: daemon entrypoint not found at ${daemonEntrypoint}`);
        process.exitCode = 1;
        return;
      }

      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        TODUAI_DATA_DIR: storagePath,
      };

      if (remoteSync) {
        childEnv.TODUAI_SYNC_SERVER = remoteSync.server;
        childEnv.TODUAI_SYNC_ENABLED = "1";
      }

      const child = spawn(process.execPath, [daemonEntrypoint], {
        cwd: process.cwd(),
        stdio: "inherit",
        env: childEnv,
      });

      const forwardSigInt = () => {
        child.kill("SIGINT");
      };
      const forwardSigTerm = () => {
        child.kill("SIGTERM");
      };

      process.on("SIGINT", forwardSigInt);
      process.on("SIGTERM", forwardSigTerm);

      try {
        const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
          (resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code, signal) => {
              resolve({ code, signal });
            });
          },
        );

        if (result.signal) {
          process.exitCode = result.signal === "SIGINT" || result.signal === "SIGTERM" ? 0 : 1;
          return;
        }

        process.exitCode = result.code ?? 1;
      } finally {
        process.off("SIGINT", forwardSigInt);
        process.off("SIGTERM", forwardSigTerm);
      }
    });

  daemon
    .command("status")
    .description("Show daemon availability and health")
    .action(async () => {
      const result = await invokeDaemon<DaemonStatusResult>("daemon.status", {});
      const format = program.opts().format;

      if (!result.ok) {
        if (result.error.code === "DAEMON_UNAVAILABLE") {
          const unavailable: DaemonStatusOutput = {
            running: false,
            reason: result.error.message,
          };

          if (format === "json") {
            console.log(formatJSON(unavailable));
          } else {
            console.log("Daemon: not running");
            console.log(`Reason: ${result.error.message}`);
          }

          return;
        }

        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const running = result.value.state === "running" && result.value.healthy;
      const output: DaemonStatusOutput = {
        running,
        status: result.value,
      };

      if (format === "json") {
        console.log(formatJSON(output));
        return;
      }

      console.log(`Daemon: ${running ? "running" : "not running"}`);
      console.log(`State:  ${result.value.state}`);
      console.log(`Role:   ${result.value.role}`);
      if (result.value.transport?.path) {
        console.log(`Socket: ${result.value.transport.path}`);
      }
      console.log(`Healthy: ${result.value.healthy ? "yes" : "no"}`);
      if (result.value.catalog.id) {
        console.log(`Catalog: ${result.value.catalog.id}`);
      }
    });
}

function resolveDaemonEntrypoint(): string {
  const explicit = process.env.TODUAI_DAEMON_ENTRYPOINT;
  if (explicit && explicit.trim().length > 0) {
    return path.resolve(explicit);
  }

  return path.resolve(import.meta.dirname, "../../../daemon/dist/entrypoint.js");
}
