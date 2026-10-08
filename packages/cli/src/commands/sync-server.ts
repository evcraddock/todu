import type { ConfiguredServerStatus } from "@todu/engine";
import type { Command } from "commander";
import { getConfigPath } from "../config.js";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON } from "../format.js";

export function registerSyncServerCommands(
  sync: Command,
  program: Command,
  invoke: CliDaemonInvoker,
): void {
  const server = sync
    .command("server")
    .description("Configure the optional server independently of direct peers");
  async function run(settings?: { server?: string; enabled?: boolean }): Promise<void> {
    const result = await invoke<ConfiguredServerStatus & { configPath?: string }>(
      settings ? "sync.serverConfigure" : "sync.serverStatus",
      settings
        ? { settings, configPath: getConfigPath(program.opts().config as string | undefined) }
        : {},
    );
    if (!result.ok) {
      console.error(formatDaemonCommandError(result.error));
      process.exitCode = 1;
      return;
    }
    if (program.opts().format === "json") console.log(formatJSON(result.value));
    else {
      const status = result.value;
      console.log(`Server:       ${status.server ?? "not configured"}`);
      console.log(`Enabled:      ${status.enabled ? "yes" : "no"} (configured policy)`);
      console.log(`Running:      ${status.running ? "yes" : "no"} (server role)`);
      console.log(`Connection:   ${status.state}`);
      if (status.configPath) console.log(`Config:       ${status.configPath}`);
      if (settings)
        console.log(
          "Server settings saved and applied. Peer/listener settings are unchanged; this is not a global sync pause or proof of synchronization.",
        );
    }
  }
  server
    .command("status")
    .description("Show server intent and current connection state")
    .action(() => run());
  server
    .command("set")
    .description("Save/apply a URL while retaining the existing enablement policy")
    .requiredOption("--url <url>", "ws:// or wss:// server destination")
    .action((options: { url: string }) => run({ server: options.url }));
  server
    .command("enable")
    .description("Persist and apply server enablement without restarting the daemon")
    .action(() => run({ enabled: true }));
  server
    .command("disable")
    .description("Disable only the server role, retaining its URL for re-enablement")
    .action(() => run({ enabled: false }));
}
