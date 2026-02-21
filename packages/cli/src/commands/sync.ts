import type { Todu } from "@todu/engine";
import type { Command } from "commander";
import { formatJSON } from "../format.js";

export function registerSyncCommands(program: Command, getTodu: () => Promise<Todu>): void {
  const sync = program.command("sync").description("Sync status and control");

  sync
    .command("status")
    .description("Show sync status")
    .action(async () => {
      const todu = await getTodu();
      try {
        const status = todu.sync.status();
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
      } finally {
        await todu.close();
      }
    });
}
