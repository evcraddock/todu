import { resolveRemoteSyncConfig } from "@todu/core";
import { createTodu } from "@todu/engine";
import type { Command } from "commander";
import { getConfigPath, loadConfig, resolveDataDir } from "../config.js";

/**
 * Register the `toduai serve` command.
 *
 * Starts a persistent sync server that:
 *   - Owns the Automerge storage on disk
 *   - Serves the local WebSocket sync server (port 24377 by default)
 *     so the CLI can connect as an ephemeral client
 *   - Optionally connects to a remote sync server for multi-device sync
 *
 * Stays running until SIGINT or SIGTERM. Suitable for use as a
 * systemd/launchd service on headless servers.
 *
 * Usage:
 *   toduai serve
 *   toduai serve --remote ws://localhost:3030
 *   toduai serve --port 24378
 */
export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start a persistent sync server (for headless/server use)")
    .option("--port <number>", "local sync server port (default: 24377)")
    .option("--remote <url>", "remote sync server URL (overrides config file sync.remote.server)")
    .action(async (opts) => {
      const configOpt = program.opts().config as string | undefined;
      const configPath = getConfigPath(configOpt);
      const fileConfig = loadConfig(configPath);
      const storagePath = resolveDataDir(configPath, fileConfig);
      const port = opts.port ? Number.parseInt(opts.port, 10) : undefined;

      // Resolve remote sync config — CLI flag beats config file, both beat nothing
      let remoteSync = resolveRemoteSyncConfig(fileConfig);
      if (opts.remote) {
        remoteSync = { server: opts.remote };
      }

      const todu = await createTodu({
        storagePath,
        syncServer: true,
        syncPort: port,
        remoteSync: remoteSync ?? undefined,
      });

      const syncPort = port ?? 24377;
      console.log(`toduai serve running`);
      console.log(`  Local sync:  ws://127.0.0.1:${syncPort}`);
      if (remoteSync) {
        console.log(`  Remote sync: ${remoteSync.server}`);
      } else {
        console.log(`  Remote sync: disabled`);
      }
      console.log(`  Data:        ${storagePath}`);
      console.log(`Press Ctrl+C to stop.`);

      // Handle graceful shutdown on SIGINT (Ctrl+C) and SIGTERM (systemd stop)
      const shutdown = async (signal: string): Promise<void> => {
        console.log(`\nReceived ${signal}, shutting down...`);
        await todu.close();
        process.exit(0);
      };

      process.on("SIGINT", () => void shutdown("SIGINT"));
      process.on("SIGTERM", () => void shutdown("SIGTERM"));

      // Keep the process alive
      await new Promise<never>(() => {
        // Intentionally never resolves — process exits via signal handlers
      });
    });
}
