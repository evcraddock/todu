import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
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

interface SyncJoinResult {
  mode: "check" | "join";
  previousCatalogId: string;
  targetCatalogId: string;
  switched: boolean;
  rolledBack: boolean;
}

type SyncControlAction = "start" | "stop" | "restart";

interface DaemonError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
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
        console.log("Remote Sync:  managed by server");
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

  sync
    .command("start")
    .description("Start remote sync through the local daemon")
    .action(async () => {
      await runSyncControl(program, invokeDaemon, "start");
    });

  sync
    .command("stop")
    .description("Stop remote sync through the local daemon")
    .action(async () => {
      await runSyncControl(program, invokeDaemon, "stop");
    });

  sync
    .command("restart")
    .description("Restart remote sync through the local daemon")
    .action(async () => {
      await runSyncControl(program, invokeDaemon, "restart");
    });

  sync
    .command("join <catalogId>")
    .description("Validate or join a catalog ID through the local daemon")
    .option("--check", "validate only; do not switch catalog pointer")
    .option("--yes", "skip confirmation for join switch")
    .action(async (catalogId: string, options: { check?: boolean; yes?: boolean }) => {
      const targetCatalogId = catalogId.trim();
      if (targetCatalogId.length === 0) {
        console.error("Error: catalog ID is required");
        process.exitCode = 1;
        return;
      }

      const validation = await invokeDaemon<SyncJoinResult>("sync.join", {
        catalogId: targetCatalogId,
        check: true,
      });

      if (!validation.ok) {
        console.error(formatJoinError(validation.error));
        process.exitCode = 1;
        return;
      }

      if (options.check) {
        renderJoinResult(program, validation.value);
        return;
      }

      if (!options.yes) {
        if (!stdin.isTTY || !stdout.isTTY) {
          console.error("Error: join confirmation requires a TTY. Re-run with --yes.");
          process.exitCode = 1;
          return;
        }

        const confirmed = await confirmJoin(validation.value);
        if (!confirmed) {
          console.log("Join canceled.");
          return;
        }
      }

      const joined = await invokeDaemon<SyncJoinResult>("sync.join", {
        catalogId: targetCatalogId,
      });

      if (!joined.ok) {
        console.error(formatJoinError(joined.error));
        process.exitCode = 1;
        return;
      }

      renderJoinResult(program, joined.value);
    });
}

async function runSyncControl(
  program: Command,
  invokeDaemon: CliDaemonInvoker,
  action: SyncControlAction,
): Promise<void> {
  const methods = action === "restart" ? ["sync.stop", "sync.start"] : [`sync.${action}`];

  for (const method of methods) {
    const result = await invokeDaemon<void>(method, {});
    if (!result.ok) {
      console.error(formatDaemonCommandError(result.error));
      process.exitCode = 1;
      return;
    }
  }

  const statusResult = await invokeDaemon<SyncStatus>("sync.status", {});
  if (!statusResult.ok) {
    console.error(formatDaemonCommandError(statusResult.error));
    process.exitCode = 1;
    return;
  }

  renderControlResult(program, action, statusResult.value);
}

function renderControlResult(
  program: Command,
  action: SyncControlAction,
  status: SyncStatus,
): void {
  const opts = program.opts();

  if (opts.format === "json") {
    console.log(formatJSON({ action, status }));
    return;
  }

  console.log(`Sync ${action}: requested`);
  console.log(`Remote Sync:  ${status.remote.state}`);
  if (status.remote.server) {
    console.log(`Server:       ${status.remote.server}`);
  }
}

function renderJoinResult(program: Command, result: SyncJoinResult): void {
  const opts = program.opts();

  if (opts.format === "json") {
    console.log(formatJSON(result));
    return;
  }

  if (result.mode === "check") {
    console.log("Validation:   OK");
    console.log(`Previous:     ${result.previousCatalogId}`);
    console.log(`Target:       ${result.targetCatalogId}`);
    console.log(
      `Would switch: ${result.previousCatalogId !== result.targetCatalogId ? "yes" : "no"}`,
    );
    return;
  }

  console.log("Join:         completed");
  console.log(`Previous:     ${result.previousCatalogId}`);
  console.log(`Target:       ${result.targetCatalogId}`);
  console.log(`Switched:     ${result.switched ? "yes" : "no"}`);
  console.log(`Rolled back:  ${result.rolledBack ? "yes" : "no"}`);
}

function formatJoinError(error: DaemonError): string {
  if (error.code !== "JOIN_FAILED") {
    return formatDaemonCommandError(error);
  }

  const stage = getStringDetail(error.details, "stage");
  const previousCatalogId = getStringDetail(error.details, "previousCatalogId");
  const targetCatalogId = getStringDetail(error.details, "targetCatalogId");
  const cause =
    getStringDetail(error.details, "cause") ??
    getStringDetail(error.details, "switchError") ??
    getStringDetail(error.details, "restoreError");

  const contextParts = [
    stage ? `stage=${stage}` : null,
    previousCatalogId ? `previous=${previousCatalogId}` : null,
    targetCatalogId ? `target=${targetCatalogId}` : null,
  ].filter((value): value is string => value !== null);

  const context = contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";
  const causeText = cause ? ` Cause: ${cause}` : "";

  return `Error: ${error.message}${context}${causeText}`;
}

function getStringDetail(details: Record<string, unknown> | undefined, key: string): string | null {
  const value = details?.[key];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value;
}

async function confirmJoin(validation: SyncJoinResult): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const answer = await rl.question(
      `Join will switch this daemon from ${validation.previousCatalogId} to ${validation.targetCatalogId}. Continue? [y/N] `,
    );

    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}
