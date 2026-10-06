import { resolveSyncListenerConfig, type SyncListenerConfig } from "@todu/core";
import type { Command } from "commander";
import { getConfigPath, saveSyncListenerConfig } from "../config.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON } from "../format.js";

export interface ListenerStatus {
  state: "disabled" | "listening" | "error";
  bind?: string;
  port?: number;
  syncPath?: string;
  error?: string;
}

export function renderListenerStatus(listener: ListenerStatus | undefined): void {
  console.log(`LAN Listener: ${listener?.state ?? "disabled"}`);
  if (listener?.bind && listener.port)
    console.log(`Bind:         ${listener.bind}:${listener.port}`);
  if (listener?.syncPath) console.log(`Sync route:   ${listener.syncPath}`);
  if (listener?.error) console.log(`Error:        ${listener.error}`);
}

export function registerSyncListenerCommands(
  sync: Command,
  program: Command,
  invokeDaemon: CliDaemonInvoker,
): void {
  const listener = sync.command("listener").description("Configure the machine-local LAN listener");
  listener
    .command("status")
    .description("Show the running daemon's listener state")
    .action(async () => {
      const result = await invokeDaemon<{ listener?: ListenerStatus }>("sync.status", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      const status = result.value.listener ?? { state: "disabled" };
      if (program.opts().format === "json") console.log(formatJSON(status));
      else renderListenerStatus(status);
    });
  listener
    .command("enable")
    .description("Save opt-in LAN listener settings; requires an explicit daemon restart")
    .option("--bind <address>", "explicit literal IPv4/IPv6 bind address")
    .option("--port <number>", "listening port (default: 24377)")
    .action((options: { bind?: string; port?: string }) => {
      const result = resolveSyncListenerConfig({
        enabled: true,
        bind: options.bind,
        port: options.port === undefined ? undefined : Number(options.port),
      });
      if (!result.ok) {
        console.error(`Error: ${result.error.field}: ${result.error.message}`);
        process.exitCode = 1;
        return;
      }
      if (!result.value) return;
      saveSettings(program, { enabled: true, ...result.value });
    });
  listener
    .command("disable")
    .description("Save disabled listener settings; requires an explicit daemon restart")
    .action(() => saveSettings(program, { enabled: false }));
}

function saveSettings(program: Command, settings: SyncListenerConfig): void {
  const configPath = getConfigPath(program.opts().config as string | undefined);
  try {
    saveSyncListenerConfig(settings, configPath);
  } catch (error) {
    console.error(`Error: cannot update listener settings in ${configPath}: ${String(error)}`);
    process.exitCode = 1;
    return;
  }
  const message =
    "Settings saved; restart the local daemon explicitly to apply. No runtime listener was changed.";
  if (program.opts().format === "json") {
    console.log(formatJSON({ configPath, listener: settings, restartRequired: true, message }));
  } else {
    console.log(`Config:       ${configPath}`);
    console.log(message);
    if (settings.enabled) {
      console.log("Trusted LAN only: HTTP/WebSocket transport is unencrypted and unauthenticated.");
    }
  }
}
