import { type EnrollmentClientStatus, type EnrollmentRequest, resolveDataDir } from "@todu/core";
import { prepareEnrollmentStorage } from "@todu/engine";
import type { Command } from "commander";
import { getConfigPath, loadConfig } from "../config.js";
import {
  type CliDaemonInvoker,
  formatDaemonCommandError,
  resolveDaemonSocketPath,
} from "../daemon-command-client.js";
import { formatError, formatJSON } from "../format.js";

export function registerSyncEnrollmentCommands(
  sync: Command,
  program: Command,
  invokeDaemon: CliDaemonInvoker,
): void {
  sync
    .command("enroll <endpoint>")
    .description("Request locally approved enrollment through one known HTTP(S) peer")
    .action(async (endpoint: string) => {
      const result = await invokeDaemon<EnrollmentClientStatus>("sync.enroll", { endpoint });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      renderStatus(program, result.value);
      if (program.opts().format !== "json" && result.value.stage === "pending")
        console.log(
          "Approve this request locally on the receiving device; the daemon will attach native sync after approval.",
        );
    });
  const enrollment = sync
    .command("enrollment")
    .description("Prepare pristine enrollment and manage local requests");
  enrollment
    .command("prepare")
    .description(
      "Prepare pristine storage before first daemon startup; never replaces an existing dataset",
    )
    .action(() => {
      const configPath = getConfigPath(program.opts().config as string | undefined);
      const storagePath = resolveDataDir(configPath, loadConfig(configPath));
      const result = prepareEnrollmentStorage({
        storagePath,
        socketPath: resolveDaemonSocketPath(storagePath),
      });
      if (!result.ok) {
        console.error(formatError(result.error));
        process.exitCode = 1;
        return;
      }
      renderStatus(program, result.value);
      if (program.opts().format !== "json")
        console.log(
          "Start the local daemon, then run: todu sync enroll <known-peer-base-endpoint>",
        );
    });
  enrollment
    .command("status")
    .description("Show this daemon's managed enrollment status")
    .action(async () => {
      const result = await invokeDaemon<EnrollmentClientStatus>("sync.enrollmentStatus", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      renderStatus(program, result.value);
    });
  enrollment
    .command("list")
    .description("List requests for the listening daemon's current catalog")
    .action(async () => {
      const result = await invokeDaemon<EnrollmentRequest[]>("sync.enrollmentRequests", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      if (program.opts().format === "json") {
        console.log(formatJSON(result.value));
        return;
      }
      if (!result.value.length) {
        console.log("No enrollment requests for the current catalog.");
        return;
      }
      for (const request of result.value) {
        console.log(`${request.requestId}  ${request.state}  ${request.device.name}`);
        console.log(`  Replica: ${request.device.id}  Expires: ${request.expiresAt}`);
        if (request.device.endpoint) console.log(`  Endpoint: ${request.device.endpoint}`);
      }
      console.log(
        "Trusted LAN only: names and replica IDs are operational metadata, not authenticated identities.",
      );
    });
  for (const action of ["approve", "deny"] as const) {
    enrollment
      .command(`${action} <requestId>`)
      .description(
        `${action === "approve" ? "Approve" : "Deny"} a request locally for this daemon's current catalog`,
      )
      .action(async (requestId: string) => {
        const result = await invokeDaemon<unknown>(
          action === "approve" ? "sync.enrollmentApprove" : "sync.enrollmentDeny",
          { requestId },
        );
        if (!result.ok) {
          console.error(formatDaemonCommandError(result.error));
          process.exitCode = 1;
          return;
        }
        if (program.opts().format === "json") console.log(formatJSON(result.value));
        else
          console.log(
            `Enrollment request ${action === "approve" ? "approved" : "denied"}: ${requestId}`,
          );
      });
  }
  enrollment
    .command("cancel")
    .description(
      "Cancel this daemon's pending request; retain identity, cached data, and existing membership",
    )
    .action(async () => {
      const result = await invokeDaemon<EnrollmentClientStatus>("sync.enrollmentCancel", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      renderStatus(program, result.value);
      if (program.opts().format !== "json")
        console.log(
          "Local polling stopped. Pending source requests expire; already-approved membership is not removed. Stored data and native identity are retained.",
        );
    });
}

function renderStatus(program: Command, status: EnrollmentClientStatus): void {
  if (program.opts().format === "json") {
    console.log(formatJSON(status));
    return;
  }
  console.log(`Enrollment: ${status.stage}`);
  if (status.endpoint) console.log(`Source:     ${status.endpoint}`);
  if (status.requestId) console.log(`Request:    ${status.requestId}`);
  if (status.deviceId) console.log(`Replica:    ${status.deviceId}`);
  if (status.error) console.log(`Error:      ${status.error}`);
}
