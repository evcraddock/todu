import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerSyncPeerCommands } from "./sync-peers.js";

function setup(
  result: unknown = { ok: true, value: { added: 2, retained: 1, removed: 1, errors: [] } },
) {
  const invoke = vi.fn(async () => result);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const program = new Command().option("--format <format>", "format", "text");
  registerSyncPeerCommands(program.command("sync"), program, invoke as CliDaemonInvoker);
  return {
    invoke,
    log,
    error,
    run: (args: string[]) => program.parseAsync(args, { from: "user" }),
  };
}
describe("explicit peer reload CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });
  it("uses private RPC without restarting or changing settings", async () => {
    const { run, invoke, log } = setup();
    await run(["sync", "peers", "reload"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("sync.peersReload", {});
    expect(log.mock.calls.flat().join(" ")).toContain("2 added, 1 retained, 1 removed");
    expect(log.mock.calls.flat().join(" ")).toContain("does not confirm peer availability");
  });
  it("renders the target report as JSON", async () => {
    const { run, log } = setup();
    await run(["--format", "json", "sync", "peers", "reload"]);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({
      added: 2,
      retained: 1,
      removed: 1,
      errors: [],
    });
  });
  it("reports unavailable local daemon without fallback ownership", async () => {
    const { run, error } = setup({
      ok: false,
      error: { code: "DAEMON_UNAVAILABLE", message: "No socket" },
    });
    await run(["sync", "peers", "reload"]);
    expect(error.mock.calls.flat().join(" ")).toContain("local daemon is required");
    expect(process.exitCode).toBe(1);
  });
});
