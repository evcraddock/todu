import { resolveSyncListenerEnableConfig, type SyncListenerConfig } from "@todu/core";
import type { SyncListenerStatus } from "@todu/engine";
import type { Command } from "commander";
import { getConfigPath, loadConfig, saveSyncListenerConfig } from "../config.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON } from "../format.js";

export type ListenerStatus = SyncListenerStatus;

export function renderListenerStatus(listener: ListenerStatus | undefined): void {
  console.log(`LAN Listener: ${listener?.state ?? "disabled"}`);
  if (listener?.bind && listener.port)
    console.log(
      `Bind:         ${listener.bind.includes(":") ? `[${listener.bind}]` : listener.bind}:${listener.port}`,
    );
  if (listener?.syncPath) console.log(`Sync route:   ${listener.syncPath}`);
  if (listener?.error) console.log(`Error:        ${listener.error}`);
  if (listener?.publication) {
    console.log(`Publication:  ${listener.publication.state}`);
    if (listener.publication.endpoint)
      console.log(`Endpoint:     ${listener.publication.endpoint}`);
    if (listener.publication.error) console.log(`Publication error: ${listener.publication.error}`);
  }
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
    .description(
      "Save opt-in LAN listener settings with automatic address selection; restart required",
    )
    .option(
      "--bind <address>",
      "optional literal IPv4/IPv6 override (otherwise reuse saved bind or detect LAN address)",
    )
    .option("--port <number>", "listening port (otherwise saved port or default: 24377)")
    .option(
      "--advertise <endpoint>",
      "optional reachable HTTP(S) endpoint override; normally published automatically after restart",
    )
    .action(async (options: { bind?: string; port?: string; advertise?: string }) => {
      const configPath = getConfigPath(program.opts().config as string | undefined);
      let saved: SyncListenerConfig | undefined;
      try {
        saved = loadConfig(configPath).sync?.listener;
      } catch (error) {
        console.error(`Error: cannot read listener settings in ${configPath}: ${String(error)}`);
        process.exitCode = 1;
        return;
      }
      const result = await resolveSyncListenerEnableConfig({
        bind: options.bind,
        port: options.port === undefined ? undefined : Number(options.port),
        saved,
        advertise: options.advertise,
      });
      if (!result.ok) {
        console.error(`Error: ${result.error.field}: ${result.error.message}`);
        process.exitCode = 1;
        return;
      }
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
    "Settings saved; restart the local daemon explicitly to apply. No runtime listener was changed. " +
    (settings.enabled
      ? "After successful startup, the daemon automatically publishes its endpoint and peers refresh known roster targets; no manual endpoint publication or peer reload is normally needed."
      : "After restart, the daemon withdraws any automatically managed listener endpoint; deliberate manual metadata is preserved.");
  const warning =
    "Trusted LAN only: HTTP/WebSocket transport is unencrypted and unauthenticated. A private IP does not establish network trust.";
  if (program.opts().format === "json") {
    console.log(
      formatJSON({
        configPath,
        listener: settings,
        restartRequired: true,
        message,
        ...(settings.enabled ? { warning } : {}),
      }),
    );
  } else {
    console.log(`Config:       ${configPath}`);
    console.log(message);
    if (settings.enabled) {
      console.log(
        `Bind:         ${settings.bind?.includes(":") ? `[${settings.bind}]` : settings.bind}:${settings.port}`,
      );
      console.log(warning);
    }
  }
}
