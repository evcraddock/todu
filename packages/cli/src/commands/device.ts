import type { Device, DeviceId } from "@todu/core";
import type { Command } from "commander";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON, formatTable } from "../format.js";

export function registerDeviceCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const device = program
    .command("device")
    .description("Manage this dataset's replicated device registry (not listener settings)");

  function print(value: Device | Device[]): void {
    if (program.opts().format === "json") {
      console.log(formatJSON(value));
      return;
    }
    const entries = Array.isArray(value) ? value : [value];
    console.log(
      formatTable(
        entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          endpoint: entry.endpoint ?? "—",
        })),
        [
          { key: "id", label: "Storage ID" },
          { key: "name", label: "Name" },
          { key: "endpoint", label: "Listening base endpoint" },
        ],
      ),
    );
  }

  async function resolveId(id?: string): Promise<string | undefined> {
    if (id !== undefined) return id;
    const result = await invokeDaemon<DeviceId>("device.localId", {});
    if (result.ok) return result.value;
    console.error(formatDaemonCommandError(result.error));
    process.exitCode = 1;
    return undefined;
  }

  device
    .command("list")
    .description("List enrolled devices; membership is not liveness or authentication")
    .action(async () => {
      const result = await invokeDaemon<Device[]>("device.list", {});
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      print(result.value);
    });

  device
    .command("rename [id]")
    .description("Name a registered device (defaults to this daemon's native storage ID)")
    .requiredOption("--name <name>", "human-readable device name")
    .action(async (id: string | undefined, opts: { name: string }) => {
      const target = await resolveId(id);
      if (!target) return;
      const result = await invokeDaemon<Device>("device.rename", { id: target, name: opts.name });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      print(result.value);
    });

  device
    .command("endpoint [id]")
    .description(
      "Update advertised metadata only; never enables/binds a listener (defaults to this daemon)",
    )
    .option("--url <baseUrl>", "HTTP(S) listening base endpoint")
    .option("--clear", "clear the advertised listening endpoint")
    .action(async (id: string | undefined, opts: { url?: string; clear?: boolean }) => {
      if ((opts.url !== undefined) === Boolean(opts.clear)) {
        console.error("Specify exactly one of --url or --clear");
        process.exitCode = 1;
        return;
      }
      const target = await resolveId(id);
      if (!target) return;
      const result = await invokeDaemon<Device>("device.setEndpoint", {
        id: target,
        endpoint: opts.clear ? null : opts.url,
      });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      print(result.value);
    });

  device
    .command("remove <id>")
    .description("Remove membership; does not instantly revoke access or delete remote data")
    .action(async (id: string) => {
      const result = await invokeDaemon<void>("device.remove", { id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }
      if (program.opts().format === "json") console.log(formatJSON({ removed: id }));
      else
        console.log(
          `Removed device ${id}. Offline replicas may not have observed removal; remote copies are not deleted.`,
        );
    });
}
