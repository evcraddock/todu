import type { Command } from "commander";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON } from "../format.js";

interface SyncStatus {
  local: {
    mode: string;
  };
  remote: {
    state: string;
    server?: string;
    lastSync?: string;
  };
}

export function registerSyncCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const sync = program.command("sync").description("Sync status and control");

  sync
    .command("status")
    .description("Show sync status")
    .action(async () => {
      const result = await invokeDaemon<SyncStatus>("sync.status", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const status = result.value;
      const opts = program.opts();

      if (opts.format === "json") {
        console.log(formatJSON(status));
        return;
      }

      console.log(`Local Mode:   ${status.local.mode}`);
      if (status.local.mode === "ephemeral-client") {
        console.log(`Remote Sync:  managed by server`);
      } else {
        console.log(`Remote Sync:  ${status.remote.state}`);
        if (status.remote.server) {
          console.log(`Server:       ${status.remote.server}`);
        }
        if (status.remote.lastSync) {
          console.log(`Last Sync:    ${status.remote.lastSync}`);
        }
      }
    });
}
