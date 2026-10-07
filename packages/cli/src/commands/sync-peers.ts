import type { PeerReloadReport } from "@todu/engine";
import type { Command } from "commander";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON } from "../format.js";

export function registerSyncPeerCommands(
  sync: Command,
  program: Command,
  invokeDaemon: CliDaemonInvoker,
): void {
  sync
    .command("peers")
    .description("Registered peer connections")
    .command("reload")
    .description("Refresh peer targets from the shared roster without restarting")
    .action(async () => {
      const result = await invokeDaemon<PeerReloadReport>("sync.peersReload", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      if (program.opts().format === "json") {
        console.log(formatJSON(result.value));
        return;
      }
      const report = result.value;
      console.log(
        `Roster refreshed: ${report.added} added, ${report.retained} retained, ${report.removed} removed.`,
      );
      for (const error of report.errors) console.error(`Warning: ${error}`);
      console.log(
        "Targets refreshed; this does not confirm peer availability or document synchronization.",
      );
    });
}
